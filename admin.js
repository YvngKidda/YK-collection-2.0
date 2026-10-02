/* ════════════════════════════════════════════════════════════════
   admin.js — hidden admin panel (tap the footer text 5 times to open)

   SECURITY MODEL
   • Login = Supabase Auth (email + password). No password lives in this file.
   • Every write (products, photos, settings, deleting feedback) is checked by the
     database itself (Row Level Security in supabase-schema.sql). Even if someone
     calls these functions from the browser console, Supabase refuses them unless
     they are signed in as YOUR admin account.
   • Hiding the panel is only for tidiness — it is not the security.
   ════════════════════════════════════════════════════════════════ */
'use strict';

const adminState = { isAdmin: false, email: null };
// addImages: URLs uploaded in the "Add product" form but not saved yet
// edit: { id, original: [urls in DB], images: [urls currently in the edit form] }
const adminForm = { addImages: [], edit: null, uploading: 0 };

const uid = () => (window.crypto && crypto.randomUUID)
  ? crypto.randomUUID()
  : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

// Turn a Supabase error into something readable on a phone screen.
function dbMsg(error) {
  const m = (error && error.message) || String(error);
  if (/row-level security|permission denied|jwt|PGRST116|not allowed/i.test(m)) return 'Not allowed \u2014 log in as admin again.';
  return m;
}

/* ════════════════════════════════════════════════════════════════
   LOGIN / LOGOUT  (Supabase Auth)
   ════════════════════════════════════════════════════════════════ */
async function verifyAdmin() {
  if (!sb) return false;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return false;
  const { data, error } = await sb.rpc('is_admin');        // true only if your user id is in public.admins
  if (error) { console.error('is_admin check failed:', error); return false; }
  adminState.email = session.user.email;
  return data === true;
}

async function initAdminAuth() {
  if (!sb) return;
  adminState.isAdmin = await verifyAdmin();                 // restores a saved login after refresh
  sb.auth.onAuthStateChange((event) => {
    // Session ended on its own (e.g. signed out in another tab)
    if (event === 'SIGNED_OUT' && adminState.isAdmin) {
      adminState.isAdmin = false;
      if ($('admin').classList.contains('active')) { go('shop'); showToast('Admin session ended'); }
    }
  });
}

function requireAdmin() {
  if (adminState.isAdmin) return true;
  showToast('Please log in as admin first');
  return false;
}

function openAdmin() {
  if (adminState.isAdmin) { enterAdminPanel(); return; }
  $('adminOverlay').classList.add('open');
  $('adminPassInput').value = '';
  $('adminPassErr').style.display = 'none';
  setTimeout(() => $('adminEmailInput').focus(), 100);
}
function closeAdminLogin() { $('adminOverlay').classList.remove('open'); }
function adminLoginError(msg) {
  const el = $('adminPassErr');
  el.textContent = msg;
  el.style.display = 'block';
}

async function submitAdminLogin(btn) {
  if (!sb) { adminLoginError('Supabase is not set up yet (see supabase-config.js).'); return; }
  const email = $('adminEmailInput').value.trim();
  const password = $('adminPassInput').value;
  if (!email || !password) { adminLoginError('Enter your email and password.'); return; }
  if (btn) btn.classList.add('btn-busy');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    if (btn) btn.classList.remove('btn-busy');
    adminLoginError(/confirm/i.test(error.message)
      ? 'Email not confirmed. In Supabase, open the user and confirm it.'
      : 'Wrong email or password.');
    $('adminPassInput').value = '';
    return;
  }
  const ok = await verifyAdmin();
  if (btn) btn.classList.remove('btn-busy');
  if (!ok) {
    await sb.auth.signOut();
    adminLoginError('This account is not set up as an admin.');
    return;
  }
  adminState.isAdmin = true;
  closeAdminLogin();
  $('adminPassInput').value = '';
  enterAdminPanel();
}

async function logoutAdmin() {
  adminState.isAdmin = false;                               // set first so the auth listener stays quiet
  if (sb) await sb.auth.signOut();
  go('shop');
  showToast('Logged out of admin');
}

function enterAdminPanel() {
  go('admin');
  renderImgStrip('add');
  renderAdminProducts();
  renderAdminCatManager();
  loadAdminFeedback();
}

// 5 quick taps on the footer text opens the admin login
let adminTapCount = 0, adminTapTimer = null;
function handleAdminTrigger() {
  adminTapCount++;
  clearTimeout(adminTapTimer);
  adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 1500);
  if (adminTapCount >= 5) { adminTapCount = 0; openAdmin(); }
}

/* ════════════════════════════════════════════════════════════════
   PHOTOS: gallery → compress → Supabase Storage → public URL
   ════════════════════════════════════════════════════════════════ */
// Shrinks big phone photos (often 4–10 MB) to a ~300 KB JPEG before uploading.
async function fileToJpegBlob(file, maxSide = 1600, quality = 0.82) {
  if (!file.type || file.type.indexOf('image/') !== 0) throw new Error('That file is not an image');
  let src, w, h, cleanup = () => {};
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });   // respects phone rotation
    w = src.width; h = src.height;
    cleanup = () => { if (src.close) src.close(); };
  } catch (e) {
    const url = URL.createObjectURL(file);
    src = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('Could not read this image'));
      im.src = url;
    });
    w = src.naturalWidth; h = src.naturalHeight;
    cleanup = () => URL.revokeObjectURL(url);
  }
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';                                   // transparent PNGs become white, not black
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(src, 0, 0, cw, ch);
  cleanup();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not process this image');
  return blob;
}

// Uploads ONE image file to the 'product-images' bucket and returns its public URL.
async function uploadProductImage(file) {
  const blob = await fileToJpegBlob(file);
  const day = new Date().toISOString().slice(0, 10);
  const path = `products/${day}/${uid()}.jpg`;              // unique name → no overwrites, safe to cache
  const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg', cacheControl: '31536000', upsert: false
  });
  if (error) throw error;
  const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function storagePathFromUrl(url) {
  const marker = `/object/public/${STORAGE_BUCKET}/`;
  const s = String(url), i = s.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(s.slice(i + marker.length).split('?')[0]);
}
async function deleteStoredImages(urls) {                   // best effort; failures only log
  const paths = (urls || []).map(storagePathFromUrl).filter(Boolean);
  if (!paths.length || !sb) return;
  const { error } = await sb.storage.from(STORAGE_BUCKET).remove(paths);
  if (error) console.warn('Could not delete old images:', error.message);
}

function formImages(mode) { return mode === 'add' ? adminForm.addImages : (adminForm.edit ? adminForm.edit.images : []); }

function renderImgStrip(mode) {
  const el = $(mode === 'add' ? 'aImgStrip' : 'eImgStrip');
  if (!el) return;
  el.innerHTML = formImages(mode).map((u, i) =>
    `<div class="img-thumb${i === 0 ? ' cover' : ''}"><img src="${esc(u)}" alt=""/>` +
    `<button type="button" class="img-x" onclick="removeFormImage('${mode}',${i})" aria-label="Remove photo">&#10005;</button>` +
    `<button type="button" class="img-star" onclick="makeCover('${mode}',${i})">${i === 0 ? 'Cover' : '&#9733; Cover'}</button></div>`).join('');
}
function makeCover(mode, i) {
  const a = formImages(mode);
  if (i === 0 || !a[i]) return;
  a.unshift(a.splice(i, 1)[0]);
  renderImgStrip(mode);
}
function removeFormImage(mode, i) {
  const a = formImages(mode);
  const url = a.splice(i, 1)[0];
  if (!url) return;
  // Never-saved photos can go from storage right now. Saved photos are removed when you press Save.
  if (mode === 'add' || !adminForm.edit.original.includes(url)) deleteStoredImages([url]);
  renderImgStrip(mode);
}

// <input type="file" multiple accept="image/*" onchange="handlePhotoPick(this,'add')">
async function handlePhotoPick(input, mode) {
  const files = Array.from(input.files || []);
  input.value = '';                                         // lets you pick the same photo again later
  if (!files.length || !requireAdmin()) return;
  if (mode === 'edit' && !adminForm.edit) return;

  const target = formImages(mode);                          // the exact list these uploads belong to
  const label = document.querySelector(`label[for="${input.id}"]`);
  const idleHtml = label ? label.innerHTML : '';
  if (label) label.classList.add('busy');
  adminForm.uploading++;
  let ok = 0, lastErr = '';

  for (let i = 0; i < files.length; i++) {
    if (label) label.textContent = `Uploading ${i + 1} of ${files.length}\u2026`;
    try {
      const url = await uploadProductImage(files[i]);
      const stillOpen = mode === 'add' || (adminForm.edit && adminForm.edit.images === target);
      if (!stillOpen) { deleteStoredImages([url]); break; } // edit window was closed mid-upload
      target.push(url);
      ok++;
      renderImgStrip(mode);
    } catch (err) {
      console.error('Upload failed:', err);
      lastErr = dbMsg(err);
    }
  }

  adminForm.uploading--;
  if (label) { label.classList.remove('busy'); label.innerHTML = idleHtml; }
  if (ok === files.length) showToast(ok === 1 ? 'Photo uploaded \u2705' : `${ok} photos uploaded \u2705`);
  else showToast(`${ok}/${files.length} uploaded. ${lastErr}`);
}

/* ════════════════════════════════════════════════════════════════
   PRODUCTS: list, add, edit, stock, delete
   ════════════════════════════════════════════════════════════════ */
function renderAdminProducts() {
  const g = $('adminProdList');
  if (!g) return;
  if (!products.length) { g.innerHTML = "<div class='admin-empty'>No products yet.</div>"; return; }
  g.innerHTML = products.map((p) =>
    "<div class='admin-prod-row'>" +
    `<div class='admin-prod-thumb'>${p.img ? `<img src="${esc(p.img)}" alt=""/>` : esc(p.emoji)}</div>` +
    `<div class='admin-prod-info'><div class='admin-prod-name'>${esc(p.name)}${p.soldOut ? " <span style='color:var(--red);font-size:.72rem'>[SOLD OUT]</span>" : ''}</div>` +
    `<div class='admin-prod-meta'>${naira(p.price)} &bull; ${esc(catMap[p.cat] || p.cat)} &bull; Stock: ${p.stock}` +
    `${p.badge ? ` &bull; <span class='admin-badge-tag'>${esc(p.badge.toUpperCase())}</span>` : ''}</div></div>` +
    "<div style='display:flex;gap:.4rem;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end'>" +
    `<button class='admin-edit-btn' onclick='openEditModal(${p.id})'>&#9998; Edit</button>` +
    `<button class='admin-edit-btn' style='background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.25);color:var(--red)' onclick='toggleSoldOut(${p.id})'>${p.soldOut ? '\u2705 In Stock' : '\uD83D\uDEAB Sold Out'}</button>` +
    `<button class='admin-del-btn' onclick='deleteProduct(${p.id})'>&#128465;</button>` +
    '</div></div>').join('');
}

// Reads + validates the add form (prefix 'a') or edit form (prefix 'e').
function readProductForm(pfx) {
  const v = (id) => $(pfx + id).value.trim();
  const price = parseInt($(pfx + 'Price').value, 10);
  const oldRaw = v('OldPrice'), stockRaw = v('Stock');
  const sizes = v('Sizes').split(',').map((s) => s.trim()).filter(Boolean);
  const stock = stockRaw === '' ? 1 : parseInt(stockRaw, 10);
  if (!v('Name')) return { error: 'Please enter a product name' };
  if (!Number.isInteger(price) || price <= 0) return { error: 'Please enter a valid price' };
  if (oldRaw && !(parseInt(oldRaw, 10) > 0)) return { error: 'Old price must be a number' };
  if (!Number.isInteger(stock) || stock < 0) return { error: 'Stock must be 0 or more' };
  if (!sizes.length) return { error: 'Please enter at least one size' };
  return {
    row: {
      title: v('Name').slice(0, 150), category: $(pfx + 'Cat').value, price,
      old_price: oldRaw ? parseInt(oldRaw, 10) : null, stock,
      badge: $(pfx + 'Badge').value || null, sizes,
      color: v('Color'), material: v('Material'),
      emoji: v('Emoji') || '\uD83D\uDC55', description: v('Desc')
    }
  };
}

async function addAdminProduct(btn) {
  if (!requireAdmin()) return;
  const f = readProductForm('a');
  if (f.error) { showToast(f.error); return; }
  if (adminForm.uploading) { showToast('Wait for the photos to finish uploading'); return; }
  if (btn) btn.classList.add('btn-busy');
  const { data, error } = await sb.from('products')
    .insert(Object.assign({}, f.row, { images: adminForm.addImages }))
    .select().single();
  if (btn) btn.classList.remove('btn-busy');
  if (error) { showToast('Could not save: ' + dbMsg(error)); return; }
  products.unshift(rowToProduct(data));
  resetAddForm(false);                                      // photos are saved now — keep them in storage
  renderAdminProducts();
  applyView();
  showToast(`${data.title} added! \uD83C\uDF89`);
}

function resetAddForm(deleteUploads) {
  if (deleteUploads && adminForm.addImages.length) deleteStoredImages(adminForm.addImages);
  adminForm.addImages = [];
  ['aName', 'aPrice', 'aOldPrice', 'aSizes', 'aColor', 'aMaterial', 'aEmoji', 'aDesc'].forEach((id) => { $(id).value = ''; });
  $('aStock').value = '1';
  $('aCat').value = 'clothing-male';
  $('aBadge').value = '';
  renderImgStrip('add');
}
function clearAdminForm() { resetAddForm(true); }

function openEditModal(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  adminForm.edit = { id, original: p.images.slice(), images: p.images.slice() };
  $('eName').value = p.name;
  $('eCat').value = p.cat;
  $('ePrice').value = p.price;
  $('eOldPrice').value = p.oldPrice || '';
  $('eStock').value = p.stock;
  $('eBadge').value = p.badge || '';
  $('eSizes').value = p.sizes.join(', ');
  $('eColor').value = p.color;
  $('eMaterial').value = p.material;
  $('eEmoji').value = p.emoji;
  $('eDesc').value = p.description;
  renderImgStrip('edit');
  $('editModalOverlay').classList.add('open');
}
function closeEditModal(saved) {
  const ed = adminForm.edit;
  if (ed && !saved) {                                       // cancelled: drop photos uploaded during this edit
    const fresh = ed.images.filter((u) => !ed.original.includes(u));
    if (fresh.length) deleteStoredImages(fresh);
  }
  adminForm.edit = null;
  $('editModalOverlay').classList.remove('open');
}

async function saveEditProduct(btn) {
  const ed = adminForm.edit;
  if (!ed || !requireAdmin()) return;
  const f = readProductForm('e');
  if (f.error) { showToast(f.error); return; }
  if (adminForm.uploading) { showToast('Wait for the photos to finish uploading'); return; }
  if (btn) btn.classList.add('btn-busy');
  const { data, error } = await sb.from('products')
    .update(Object.assign({}, f.row, { images: ed.images }))
    .eq('id', ed.id).select().single();
  if (btn) btn.classList.remove('btn-busy');
  if (error) { showToast('Could not save: ' + dbMsg(error)); return; }
  const removed = ed.original.filter((u) => !ed.images.includes(u));
  const idx = products.findIndex((x) => x.id === ed.id);
  if (idx > -1) products[idx] = rowToProduct(data);
  closeEditModal(true);
  if (removed.length) deleteStoredImages(removed);
  renderAdminProducts();
  applyView();
  showToast(`${data.title} updated!`);
}

async function toggleSoldOut(id) {
  if (!requireAdmin()) return;
  const p = products.find((x) => x.id === id);
  if (!p) return;
  const { data, error } = await sb.from('products').update({ stock: p.soldOut ? 1 : 0 })
    .eq('id', id).select().single();
  if (error) { showToast('Could not update: ' + dbMsg(error)); return; }
  products[products.findIndex((x) => x.id === id)] = rowToProduct(data);
  renderAdminProducts();
  applyView();
  showToast(data.stock === 0 ? 'Marked sold out' : 'Back in stock (1 unit) \u2014 tap Edit to set the exact number');
}

async function deleteProduct(id) {
  if (!requireAdmin()) return;
  const p = products.find((x) => x.id === id);
  if (!p || !confirm(`Delete "${p.name}"? This also removes its photos and reviews.`)) return;
  const { data, error } = await sb.from('products').delete().eq('id', id).select('id');
  if (error || !data || !data.length) { showToast('Could not delete: ' + (error ? dbMsg(error) : 'not allowed')); return; }
  products = products.filter((x) => x.id !== id);
  deleteStoredImages(p.images);
  renderAdminProducts();
  applyView();
  showToast('Product deleted');
}

/* ════════════════════════════════════════════════════════════════
   REVIEW MODERATION (delete button shows on reviews while you're logged in)
   ════════════════════════════════════════════════════════════════ */
async function adminDeleteReview(reviewId) {
  if (!requireAdmin() || !confirm('Delete this review?')) return;
  const { data, error } = await sb.from('reviews').delete().eq('id', reviewId).select('id');
  if (error || !data || !data.length) { showToast('Could not delete: ' + (error ? dbMsg(error) : 'not allowed')); return; }
  if (curProd) { await refreshRating(curProd.id); loadReviews(curProd.id); applyView(); }
  showToast('Review deleted');
}

/* ════════════════════════════════════════════════════════════════
   "COMING SOON" CATEGORY TOGGLES  (saved in the `settings` table → same on every device)
   ════════════════════════════════════════════════════════════════ */
function renderAdminCatManager() {
  const box = $('adminCatManager');
  if (!box) return;
  const allCats = [].concat(shopCategories.men, shopCategories.women, shopCategories.unisex);
  const btn = (soon, onclick) =>
    `<button onclick='${onclick}' style='padding:.4rem 1rem;border-radius:50px;font-size:.75rem;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;border:1px solid;transition:all .2s;` +
    (soon ? 'background:rgba(245,158,11,.12);color:#f59e0b;border-color:rgba(245,158,11,.3)' : 'background:rgba(34,197,94,.1);color:var(--green);border-color:rgba(34,197,94,.25)') +
    `'>${soon ? '&#128683; Coming Soon' : '&#9989; Active'}</button>`;
  const row = (label, soon, onclick, last) =>
    `<div style='display:flex;align-items:center;justify-content:space-between;padding:.65rem 0;${last ? '' : 'border-bottom:1px solid var(--border)'}'>` +
    `<span style='font-size:.88rem;color:var(--text);font-weight:500'>${esc(label)}</span>${btn(soon, onclick)}</div>`;
  box.innerHTML =
    "<div style='margin-bottom:1rem'><div class='admin-f-lbl' style='margin-bottom:.75rem;font-size:.8rem'>Toggle categories between Active and Coming Soon:</div>" +
    allCats.map((c) => row(c.label, !!comingSoonCats[c.id], `toggleCatSoon("${c.id}")`)).join('') + '</div>' +
    "<div class='admin-f-lbl' style='margin:.75rem 0;font-size:.8rem'>Special sections:</div>" +
    row('New Arrivals tab', comingSoonSpecial.newArrivals, 'toggleSpecialSoon("newArrivals")') +
    row('Sale / Deals tab', comingSoonSpecial.sale, 'toggleSpecialSoon("sale")', true);
}

async function saveSettings() {
  const { error } = await sb.from('settings').upsert({
    key: 'categories',
    value: { comingSoonCats, comingSoonSpecial },
    updated_at: new Date().toISOString()
  });
  if (error) { showToast('Could not save: ' + dbMsg(error)); return false; }
  return true;
}
async function toggleCatSoon(catId) {
  if (!requireAdmin()) return;
  const was = !!comingSoonCats[catId];
  if (was) delete comingSoonCats[catId]; else comingSoonCats[catId] = true;
  if (await saveSettings()) showToast('Category updated!');
  else { if (was) comingSoonCats[catId] = true; else delete comingSoonCats[catId]; }
  buildShopFilterBar();
  renderAdminCatManager();
}
async function toggleSpecialSoon(key) {
  if (!requireAdmin()) return;
  comingSoonSpecial[key] = !comingSoonSpecial[key];
  if (await saveSettings()) showToast('Section updated!');
  else comingSoonSpecial[key] = !comingSoonSpecial[key];
  buildShopFilterBar();
  renderAdminCatManager();
}

/* ════════════════════════════════════════════════════════════════
   CUSTOMER FEEDBACK INBOX  (the `feedback` table — only you can read it)
   ════════════════════════════════════════════════════════════════ */
let adminFeedback = [];
async function loadAdminFeedback() {
  const box = $('adminCompList');
  if (!box || !sb) return;
  const { data, error } = await sb.from('feedback').select('*').order('created_at', { ascending: false });
  if (error) { box.innerHTML = "<div class='admin-no-comp'>Couldn\u2019t load messages.</div>"; return; }
  adminFeedback = data;
  renderAdminFeedback();
}
function renderAdminFeedback() {
  const box = $('adminCompList');
  if (!adminFeedback.length) { box.innerHTML = "<div class='admin-no-comp'>No messages yet from customers.</div>"; return; }
  box.innerHTML = adminFeedback.map((c) =>
    "<div class='admin-comp-item'><div class='admin-comp-hdr'><div style='display:flex;align-items:center;gap:.6rem'>" +
    `<span class='admin-comp-type ${esc(c.type)}'>${esc(c.type.toUpperCase())}</span><span class='admin-comp-name'>${esc(c.name)}</span></div>` +
    `<span class='admin-comp-date'>${esc(new Date(c.created_at).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span></div>` +
    (c.email ? `<div class='admin-comp-date' style='margin-bottom:.4rem'>${esc(c.email)}</div>` : '') +
    `<div class='admin-comp-msg'>${esc(c.message)}</div>` +
    `<button class='admin-comp-del' onclick='deleteFeedback(${c.id})'>&#128465; Delete</button></div>`).join('');
}
async function deleteFeedback(id) {
  if (!requireAdmin()) return;
  const { data, error } = await sb.from('feedback').delete().eq('id', id).select('id');
  if (error || !data || !data.length) { showToast('Could not delete: ' + (error ? dbMsg(error) : 'not allowed')); return; }
  adminFeedback = adminFeedback.filter((c) => c.id !== id);
  renderAdminFeedback();
}

/* ════════════════════════════════════════════════════════════════
   START
   ════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initAdminAuth();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && $('adminOverlay').classList.contains('open')) submitAdminLogin($('adminLoginBtn'));
  });
});
// Keep the admin lists in sync once the store data arrives
document.addEventListener('store:loaded', () => { renderAdminProducts(); renderAdminCatManager(); });
