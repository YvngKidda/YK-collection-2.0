/* ════════════════════════════════════════════════════════════════
   script.js — YK Collection storefront + shared UI
   Data (products, reviews, feedback, settings) comes from Supabase via `sb`
   (created in supabase-config.js). Admin-only code lives in admin.js.
   ════════════════════════════════════════════════════════════════ */
'use strict';

/* ── CONSTANTS & HELPERS ── */
const WA_NUMBER = '2349014223167';
const LOW_STOCK = 3;            // show "Only N left" when stock is 1..LOW_STOCK
const catMap = {
  'clothing-male': 'Male Clothing', 'clothing-female': 'Female Clothing',
  'shoes-male': 'Male Shoes', 'shoes-female': 'Female Shoes',
  'bags-male': 'Male Bags', 'watches-male': 'Male Watches',
  'watches-female': 'Female Watches', 'jewelry-female': 'Female Jewelry', 'jerseys': 'Jerseys'
};
const shopCategories = {
  unisex: [{ id: 'jerseys', label: 'Jerseys' }],
  men: [
    { id: 'clothing-male', label: 'Clothing' }, { id: 'shoes-male', label: 'Shoes' },
    { id: 'bags-male', label: 'Bags' }, { id: 'watches-male', label: 'Watches & Accessories' }
  ],
  women: [
    { id: 'clothing-female', label: 'Clothing' }, { id: 'shoes-female', label: 'Shoes' },
    { id: 'bags-female', label: 'Bags' }, { id: 'watches-female', label: 'Watches' },
    { id: 'jewelry-female', label: 'Jewelry & Accessories' }
  ]
};

const $ = (id) => document.getElementById(id);
// Escape ANY text that came from the database before putting it in innerHTML.
// (Reviews and feedback are written by strangers — this stops script injection.)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const naira = (n) => '\u20A6' + Number(n || 0).toLocaleString();
const isUrl = (s) => typeof s === 'string' && /^https?:\/\//i.test(s);
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
const starsText = (n) => '\u2605'.repeat(n) + '\u2606'.repeat(5 - n);
const sizeKey = (s) => String(s || '').trim().toUpperCase();
// Per-size pricing: base price + the extra amount set for that size (size_surcharges in the database)
const sizeExtra = (p, size) => (size && p.sizeAdd[size]) || 0;
const priceFor = (p, size) => p.price + sizeExtra(p, size);
const oldPriceFor = (p, size) => (p.oldPrice ? p.oldPrice + sizeExtra(p, size) : null);
const hasSizePricing = (p) => Object.keys(p.sizeAdd).length > 0;
const isLowStock = (p) => p.stock > 0 && p.stock <= LOW_STOCK;

let toastTimer = null;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ── STATE ── */
let products = [];
let ratings = {};                       // { [productId]: { avg, count } }
let curProd = null, selSize = null, cart = [];
let selectedStars = 0;
let comingSoonCats = { 'jewelry-female': true };
let comingSoonSpecial = { newArrivals: false, sale: false };
let activeFilterCat = 'all';
let activeFilterSpecial = 'all';
// Sort + filter choices made in the shop toolbar
const viewState = { sort: 'newest', min: null, max: null, sizes: new Set(), inStock: false, minRating: 0 };
let deepLinkDone = false;
const STORAGE_CART = 'yk_cart_v1';

/* ════════════════════════════════════════════════════════════════
   DATA LAYER (Supabase)
   ════════════════════════════════════════════════════════════════ */
// Convert a database row into the shape the UI uses.
function rowToProduct(r) {
  const imgs = Array.isArray(r.images) ? r.images.filter(Boolean) : [];
  const spin = Array.isArray(r.spin_images) ? r.spin_images.filter(Boolean) : [];
  const add = {};
  if (r.size_surcharges && typeof r.size_surcharges === 'object') {
    Object.keys(r.size_surcharges).forEach((k) => { const n = Number(r.size_surcharges[k]); if (n > 0) add[k] = n; });
  }
  return {
    id: r.id, name: r.title, description: r.description || '',
    price: r.price, oldPrice: r.old_price, stock: r.stock, soldOut: r.stock <= 0,
    cat: r.category, badge: r.badge, sizes: r.sizes || [], sizeAdd: add,
    color: r.color || '', material: r.material || '', emoji: r.emoji || '\uD83D\uDC55',
    images: imgs, img: imgs[0] || spin[0] || null,
    spinImages: spin, spinEnabled: !!r.spin_enabled && spin.length >= 4,   // 360° needs at least 4 frames
    createdAt: r.created_at
  };
}

async function loadStore() {
  const grid = $('prodGrid');
  if (!sb) {
    grid.innerHTML = '<div class="grid-msg">Store not connected yet.<br>Add your Supabase URL and key in <b>supabase-config.js</b>.</div>';
    return;
  }
  grid.innerHTML = '<div class="grid-msg">Loading products\u2026</div>';
  try {
    const [pr, rt, st] = await Promise.all([
      sb.from('products').select('*').order('created_at', { ascending: false }),
      sb.from('product_ratings').select('product_id, avg_rating, review_count'),
      sb.from('settings').select('value').eq('key', 'categories').maybeSingle()
    ]);
    if (pr.error) throw pr.error;

    ratings = {};
    (rt.data || []).forEach((r) => { ratings[r.product_id] = { avg: Number(r.avg_rating), count: r.review_count }; });
    products = pr.data.map(rowToProduct);

    const s = st.data && st.data.value;
    if (s && s.comingSoonCats) comingSoonCats = s.comingSoonCats;
    if (s && s.comingSoonSpecial) comingSoonSpecial = Object.assign({}, comingSoonSpecial, s.comingSoonSpecial);

    syncCartWithProducts();
    applyView();
    document.dispatchEvent(new CustomEvent('store:loaded'));
    handleDeepLink();
  } catch (e) {
    console.error('Could not load store:', e);
    grid.innerHTML = '<div class="grid-msg">Couldn\u2019t load products. Check your connection.<br><button onclick="loadStore()">Try again</button></div>';
  }
}

async function loadReviews(productId) {
  let revs = [];
  if (sb) {
    const { data, error } = await sb.from('reviews')
      .select('id, user_name, rating, comment, created_at')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    if (error) console.error('Reviews error:', error); else revs = data;
  }
  if (!curProd || curProd.id !== productId) return;   // user already moved on
  renderReviews(revs);
}

async function refreshRating(productId) {
  if (!sb) return;
  const { data } = await sb.from('product_ratings')
    .select('product_id, avg_rating, review_count').eq('product_id', productId).maybeSingle();
  if (data) ratings[productId] = { avg: Number(data.avg_rating), count: data.review_count };
}

/* ════════════════════════════════════════════════════════════════
   PAGE NAVIGATION
   ════════════════════════════════════════════════════════════════ */
function go(name) {
  const cur = document.querySelector('.page.active');
  const next = $(name);
  if (!next || next === cur) return;
  if (name !== 'product-detail') clearProductUrl();
  const show = () => {
    next.classList.add('active');
    window.scrollTo(0, 0);
    setTimeout(() => runReveal(next), 50);
  };
  if (cur) {
    cur.style.opacity = '0';
    cur.style.transform = 'translateY(-15px)';
    setTimeout(() => {
      cur.classList.remove('active');
      cur.style.opacity = '';
      cur.style.transform = '';
      show();
    }, 300);
  } else show();
  const land = name === 'landing';
  $('mainNav').classList.toggle('visible', !land);
  $('mainFtr').classList.toggle('visible', !land);
  setTimeout(() => { const w = $('waFloat'); if (w) w.classList.toggle('visible', !land); }, 350);
  closeMob();
}
function runReveal(container) {
  (container || document).querySelectorAll('.reveal').forEach((el, i) => {
    el.classList.remove('shown');
    setTimeout(() => el.classList.add('shown'), 80 + i * 90);
  });
}
function toggleMenu() { $('mobMenu').classList.toggle('open'); $('burger').classList.toggle('open'); }
function closeMob() { $('mobMenu').classList.remove('open'); $('burger').classList.remove('open'); }
function toggleSub(id) { $(id).classList.toggle('open'); }
window.addEventListener('scroll', () => {
  const n = $('mainNav');
  if (n.classList.contains('visible')) n.classList.toggle('scrolled', window.scrollY > 20);
});

/* ════════════════════════════════════════════════════════════════
   PRODUCT GRID, FILTERS, SEARCH
   ════════════════════════════════════════════════════════════════ */
function renderProds(list) {
  const g = $('prodGrid');
  if (!list.length) {
    g.innerHTML = products.length
      ? '<div class="grid-msg">No products match your choices.<br><button onclick="clearEverything()">Clear all filters</button></div>'
      : '<div class="grid-msg">No products yet \u2014 check back soon!</div>';
    return;
  }
  g.innerHTML = list.map((p, i) => {
    const r = ratings[p.id];
    const click = p.soldOut ? "showToast('This product is sold out')" : `openProd(${p.id})`;
    return `<div class="prod-card${p.soldOut ? ' sold-out' : ''}" style="animation-delay:${Math.min(i, 12) * 0.07}s" onclick="${click}">` +
      `<div class="prod-thumb">${p.img ? `<img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy"/>` : esc(p.emoji)}` +
      (p.soldOut ? '<div class="prod-sold-overlay"><div class="prod-sold-stamp">Sold Out</div></div>' : '') +
      '<div class="prod-thumb-overlay"></div>' +
      (p.badge && !p.soldOut ? `<div class="prod-badge ${esc(p.badge)}">${esc(p.badge.toUpperCase())}</div>` : '') +
      (p.spinEnabled ? '<div class="spin-tag">&#8635; 360&deg;</div>' : '') +
      '</div><div class="prod-info">' +
      `<div class="prod-cat">${esc(catMap[p.cat] || p.cat)}</div>` +
      `<div class="prod-name">${esc(p.name)}</div>` +
      `<div class="prod-rating">${r && r.count
        ? `\u2605${r.avg.toFixed(1)} (${r.count} review${r.count !== 1 ? 's' : ''})`
        : '<span style="color:var(--text3);font-size:.75rem">No reviews yet</span>'}</div>` +
      (isLowStock(p) ? `<div class="low-stock">\uD83D\uDD25 Only ${p.stock} left</div>` : '') +
      `<div><span class="prod-price">${hasSizePricing(p) ? '<small class="from">From </small>' : ''}${naira(p.price)}</span>` +
      `${p.oldPrice ? `<span class="prod-price-old">${naira(p.oldPrice)}</span>` : ''}</div>` +
      `<button class="view-btn">${p.soldOut ? 'Sold Out' : 'View Product \u2192'}</button></div></div>`;
  }).join('');
}

/* ── what the grid shows: category/special/search → toolbar filters → sort ── */
function baseList() {
  const q = ($('searchBox').value || '').trim().toLowerCase();
  if (q) {
    return products.filter((p) => [p.name, catMap[p.cat], p.color, p.material]
      .some((v) => (v || '').toLowerCase().includes(q)));
  }
  if (activeFilterSpecial === 'new') return products.filter((p) => p.badge === 'new');
  if (activeFilterSpecial === 'sale') return products.filter((p) => p.badge === 'sale');
  if (activeFilterCat !== 'all') return products.filter((p) => p.cat === activeFilterCat);
  return products;
}
const ratingOf = (p) => (ratings[p.id] ? ratings[p.id].avg : 0);
const reviewsOf = (p) => (ratings[p.id] ? ratings[p.id].count : 0);
const SORTERS = {
  newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  rating: (a, b) => (ratingOf(b) - ratingOf(a)) || (reviewsOf(b) - reviewsOf(a)),
  name: (a, b) => a.name.localeCompare(b.name)
};
function currentList() {
  const v = viewState;
  const list = baseList().filter((p) => {
    if (v.min != null && p.price < v.min) return false;
    if (v.max != null && p.price > v.max) return false;
    if (v.inStock && p.soldOut) return false;
    if (v.sizes.size && !p.sizes.some((s) => v.sizes.has(sizeKey(s)))) return false;
    if (v.minRating && ratingOf(p) < v.minRating) return false;
    return true;
  });
  return list.slice().sort(SORTERS[v.sort] || SORTERS.newest);
}

function applyView() {
  const list = currentList();
  renderProds(list);
  buildShopFilterBar();
  buildSizeChips();
  updateToolbar(list.length);
  let label = null;
  if (activeFilterSpecial === 'new') label = 'New Arrivals';
  else if (activeFilterSpecial === 'sale') label = 'Sale / Deals';
  else if (activeFilterCat !== 'all' && activeFilterSpecial.indexOf('unisex-') !== 0) label = catMap[activeFilterCat] || activeFilterCat;
  if (label) updateActiveFilterStrip(label); else clearActiveFilterStrip();
}

/* ── sort / filter toolbar ── */
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL'];
function buildSizeChips() {
  const box = $('sizeChips');
  if (!box) return;
  const all = new Set();
  products.forEach((p) => p.sizes.forEach((s) => { const k = sizeKey(s); if (k) all.add(k); }));
  Array.from(viewState.sizes).forEach((k) => { if (!all.has(k)) viewState.sizes.delete(k); });
  const rank = (k) => {
    const i = SIZE_ORDER.indexOf(k);
    if (i > -1) return [0, i];
    return /^\d+(\.\d+)?$/.test(k) ? [1, Number(k)] : [2, 0];
  };
  const keys = Array.from(all).sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    return (ra[0] - rb[0]) || (ra[1] - rb[1]) || a.localeCompare(b);
  });
  box.innerHTML = keys.length
    ? keys.map((k) => `<button type="button" class="size-chip${viewState.sizes.has(k) ? ' on' : ''}" data-size="${esc(k)}">${esc(k)}</button>`).join('')
    : '<span class="fp-empty">No sizes yet</span>';
}
function activeFilterCount() {
  const v = viewState;
  return (v.min != null || v.max != null ? 1 : 0) + (v.sizes.size ? 1 : 0) + (v.inStock ? 1 : 0) + (v.minRating ? 1 : 0);
}
function updateToolbar(count) {
  const c = $('toolbarCount');
  if (c) c.textContent = `${count} item${count !== 1 ? 's' : ''}`;
  const n = activeFilterCount();
  const b = $('filterBadge');
  if (b) { b.textContent = n || ''; b.style.display = n ? 'inline-flex' : 'none'; }
  const r = $('filterReset');
  if (r) r.style.display = n ? 'inline-block' : 'none';
}
function toggleFilterPanel() {
  const open = $('filterPanel').classList.toggle('open');
  $('filterToggle').setAttribute('aria-expanded', String(open));
}
function onSortChange() { viewState.sort = $('sortSelect').value; applyView(); }
let filterTimer = null;
function onFilterChange() {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => {
    const num = (id) => {
      const raw = $(id).value.trim(), n = Number(raw);
      return raw === '' || !isFinite(n) ? null : Math.max(0, n);
    };
    viewState.min = num('fMin');
    viewState.max = num('fMax');
    viewState.inStock = $('fStock').checked;
    viewState.minRating = Number($('fRating').value) || 0;
    applyView();
  }, 180);
}
function toggleSizeChip(key) {
  if (viewState.sizes.has(key)) viewState.sizes.delete(key); else viewState.sizes.add(key);
  applyView();
}
function resetViewState() {
  const v = viewState;
  v.min = null; v.max = null; v.inStock = false; v.minRating = 0; v.sizes.clear();
  ['fMin', 'fMax'].forEach((id) => { const e = $(id); if (e) e.value = ''; });
  const st = $('fStock'); if (st) st.checked = false;
  const rt = $('fRating'); if (rt) rt.value = '0';
}
function resetFilters() { resetViewState(); applyView(); }
function clearEverything() {
  activeFilterCat = 'all'; activeFilterSpecial = 'all';
  $('searchBox').value = ''; $('searchClear').style.display = 'none';
  resetViewState();
  applyView();
}

function buildShopFilterBar() {
  const bar = $('shopFilterBar');
  if (!bar) return;
  const tab = (special, text, soon, active) =>
    `<button class="filter-tab${active ? ' active' : ''}" data-special="${special}">${text}${soon ? '<span class="tab-soon">Soon</span>' : ''}</button>`;
  const unisex = shopCategories.unisex.map((cat) => comingSoonCats[cat.id]
    ? `<button class="filter-tab${activeFilterCat === cat.id ? ' active' : ''}" style="opacity:.55;cursor:default">${cat.label}<span class="tab-soon">Soon</span></button>`
    : tab('unisex-' + cat.id, cat.label, false, activeFilterCat === cat.id)).join('');
  bar.innerHTML =
    '<div class="shop-filter-inner" id="shopFilterInner">' +
    tab('all', 'All', false, activeFilterSpecial === 'all' && activeFilterCat === 'all') +
    tab('new', 'New Arrivals', comingSoonSpecial.newArrivals, activeFilterSpecial === 'new') +
    tab('sale', 'Sale / Deals', comingSoonSpecial.sale, activeFilterSpecial === 'sale') +
    unisex + '</div><div class="active-filter-strip" id="activeFilterStrip"></div>';
}

function filterByCat(cat) {
  if (comingSoonCats[cat]) { showToast('This category is coming soon!'); return; }
  activeFilterCat = cat;
  activeFilterSpecial = 'all';
  $('searchBox').value = ''; $('searchClear').style.display = 'none';
  applyView();
}
function filterSpecial(type) {
  if (type === 'new' && comingSoonSpecial.newArrivals) { showToast('New Arrivals coming soon!'); return; }
  if (type === 'sale' && comingSoonSpecial.sale) { showToast('Sale / Deals coming soon!'); return; }
  $('searchBox').value = ''; $('searchClear').style.display = 'none';
  if (type.indexOf('unisex-') === 0) {
    activeFilterCat = type.replace('unisex-', '');
    activeFilterSpecial = type;
  } else {
    activeFilterCat = 'all';
    activeFilterSpecial = type;
  }
  applyView();
}
function filterGo(cat) { go('shop'); setTimeout(() => filterByCat(cat), 350); }

function updateActiveFilterStrip(label) {
  const strip = $('activeFilterStrip');
  if (!strip) return;
  strip.classList.add('show');
  strip.innerHTML = `<div class="active-filter-chip">${esc(label)}<button onclick="clearActiveFilter()">&#10005;</button></div>`;
}
function clearActiveFilterStrip() {
  const strip = $('activeFilterStrip');
  if (strip) { strip.classList.remove('show'); strip.innerHTML = ''; }
}
function clearActiveFilter() { activeFilterCat = 'all'; activeFilterSpecial = 'all'; applyView(); }

function handleSearch() {
  const q = $('searchBox').value.trim();
  $('searchClear').style.display = q ? 'block' : 'none';
  activeFilterCat = 'all'; activeFilterSpecial = 'all';
  applyView();
}
function clearSearch() {
  $('searchBox').value = '';
  $('searchClear').style.display = 'none';
  applyView();
}

/* ════════════════════════════════════════════════════════════════
   PRODUCT DETAIL
   ════════════════════════════════════════════════════════════════ */
function openProd(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  curProd = p; selSize = null;
  buildGallery(p);
  $('detBadge').textContent = p.badge ? p.badge.toUpperCase() : (catMap[p.cat] || p.cat);
  $('detName').textContent = p.name;
  renderDetailPrice(false);
  renderStockPill();
  $('sizesWrap').innerHTML = p.sizes.map((s) =>
    `<button class="sz-btn" data-size="${esc(s)}" onclick="pickSize(this)">${esc(s)}</button>`).join('');
  $('detDesc').innerHTML = esc(p.description || 'A premium quality piece from YK Collection.').replace(/\n/g, '<br>');
  const avail = p.stock > 5 ? 'In stock' : `Only ${p.stock} left`;
  $('detMeta').innerHTML = [
    ['Category', catMap[p.cat] || p.cat], ['Color', p.color || 'N/A'],
    ['Material', p.material || 'N/A'], ['Availability', avail]
  ].map(([k, v]) => `<div class="det-meta-row"><span class="det-meta-lbl">${k}</span><span class="det-meta-val">${esc(v)}</span></div>`).join('');
  closeReviewForm();
  $('reviewsSummary').style.display = 'none';
  $('reviewsList').innerHTML = '<div class="no-reviews">Loading reviews\u2026</div>';
  loadReviews(p.id);
  setProductUrl(p.id);
  go('product-detail');
}

function pickSize(btn) {
  document.querySelectorAll('.sz-btn').forEach((b) => b.classList.remove('sel'));
  btn.classList.add('sel');
  selSize = btn.dataset.size;
  renderDetailPrice(true);                       // price follows the size the shopper taps
}
// Shows the price for the chosen size (or the base price + a note until a size is chosen)
function renderDetailPrice(animate) {
  const p = curProd;
  if (!p) return;
  const price = priceFor(p, selSize), old = oldPriceFor(p, selSize);
  const el = $('detPrice');
  el.innerHTML = naira(price) + (old ? `<span class="det-price-old">${naira(old)}</span>` : '') +
    (!selSize && hasSizePricing(p) ? '<span class="price-note">Price varies by size</span>' : '');
  if (animate) { el.classList.remove('price-pop'); void el.offsetWidth; el.classList.add('price-pop'); }
}
function renderStockPill() {
  const el = $('detStock');
  if (!el || !curProd) return;
  if (isLowStock(curProd)) { el.textContent = `\uD83D\uDD25 Only ${curProd.stock} left \u2014 order soon`; el.style.display = 'inline-flex'; }
  else el.style.display = 'none';
}

/* ── share link + deep link (?p=ID opens that product directly) ── */
function productUrl(id) { return location.origin + location.pathname + '?p=' + id; }
function setProductUrl(id) { try { history.replaceState(null, '', '?p=' + id); } catch (e) { /* ignore */ } }
function clearProductUrl() {
  try { if (/[?&]p=/.test(location.search)) history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
}
function handleDeepLink() {
  if (deepLinkDone) return;
  deepLinkDone = true;
  const id = Number(new URLSearchParams(location.search).get('p'));
  if (!id) return;
  const p = products.find((x) => x.id === id);
  if (!p || p.soldOut) {
    showToast(p ? 'This product is sold out' : 'That product is no longer available');
    go('shop'); clearProductUrl();
    return;
  }
  openProd(id);
}
async function shareProduct() {
  if (!curProd) return;
  const url = productUrl(curProd.id);
  const data = { title: curProd.name + ' | YK Collection', text: `${curProd.name} \u2014 ${naira(curProd.price)} on YK Collection`, url };
  try { if (navigator.share) { await navigator.share(data); return; } }
  catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); showToast('Link copied!'); }
  catch (e) { window.prompt('Copy this link:', url); }
}

/* ── REVIEWS ── */
function openReviewForm() {
  selectedStars = 0;
  $('reviewName').value = '';
  $('reviewText').value = '';
  updateStarPicker(0);
  $('reviewForm').classList.add('open');
  $('reviewForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function closeReviewForm() { $('reviewForm').classList.remove('open'); }
function updateStarPicker(n) {
  document.querySelectorAll('.star-pick').forEach((s, i) => s.classList.toggle('lit', i < n));
  selectedStars = n;
}
function hoverStar(n) { document.querySelectorAll('.star-pick').forEach((s, i) => s.classList.toggle('lit', i < n)); }
function unhoverStar() { updateStarPicker(selectedStars); }

async function submitReview(btn) {
  if (!curProd) return;
  if (!sb) { showToast('Reviews are unavailable right now'); return; }
  const name = $('reviewName').value.trim();
  const text = $('reviewText').value.trim();
  if (!name) { showToast('Please enter your name'); return; }
  if (!selectedStars) { showToast('Please select a star rating'); return; }
  const pid = curProd.id;
  if (btn) btn.classList.add('btn-busy');
  const { error } = await sb.from('reviews').insert({
    product_id: pid, user_name: name.slice(0, 60), rating: selectedStars, comment: text.slice(0, 1000)
  });
  if (btn) btn.classList.remove('btn-busy');
  if (error) { console.error('Review error:', error); showToast('Could not post your review. Please try again.'); return; }
  closeReviewForm();
  showToast('Thank you for your review! \u2605');
  await refreshRating(pid);
  loadReviews(pid);
  applyView();
}

function renderReviews(revs) {
  const box = $('reviewsList'), summary = $('reviewsSummary');
  if (!revs.length) {
    summary.style.display = 'none';
    box.innerHTML = "<div class='no-reviews'>No reviews yet. Be the first to review this product!</div>";
    return;
  }
  const avg = revs.reduce((t, r) => t + r.rating, 0) / revs.length;
  summary.innerHTML = `<span class="reviews-avg">${avg.toFixed(1)}</span><div><div class="reviews-avg-stars">${starsText(Math.round(avg))}</div>` +
    `<div class="reviews-avg-count">${revs.length} review${revs.length !== 1 ? 's' : ''}</div></div>`;
  summary.style.display = 'flex';
  box.innerHTML = revs.map((r) =>
    `<div class="review-item"><div class="review-meta"><span class="review-name">${esc(r.user_name)}</span>` +
    `<span class="review-date">${fmtDate(r.created_at)}</span></div>` +
    `<div class="review-stars">${starsText(r.rating)}</div>` +
    (r.comment ? `<div class="review-text">${esc(r.comment)}</div>` : '') +
    // Delete button only appears while you're logged in as admin (the database enforces it either way)
    ((typeof adminState !== 'undefined' && adminState.isAdmin)
      ? `<button class="admin-comp-del" onclick="adminDeleteReview(${r.id})">&#128465; Delete</button>` : '') +
    '</div>').join('');
}

/* ════════════════════════════════════════════════════════════════
   CART + WHATSAPP CHECKOUT  (cart stays on the shopper's own device)
   ════════════════════════════════════════════════════════════════ */
function saveCart() { try { localStorage.setItem(STORAGE_CART, JSON.stringify(cart)); } catch (e) { /* private mode */ } }
function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_CART) || '[]');
    if (Array.isArray(saved)) cart = saved;
  } catch (e) { cart = []; }
  updateCart();
}
// Prices/stock can change in Supabase, so refresh the cart whenever the store loads.
function syncCartWithProducts() {
  if (!cart.length) return;
  const next = [];
  cart.forEach((it) => {
    const p = products.find((x) => x.id === it.id);
    if (!p || p.soldOut || !p.sizes.includes(it.size)) return;
    next.push(Object.assign({}, it, { name: p.name, price: priceFor(p, it.size), img: p.img, emoji: p.emoji, cat: p.cat }));
  });
  if (next.length !== cart.length) showToast('Some items in your cart are no longer available');
  cart = next; saveCart(); updateCart();
}

function addFromDetail() {
  if (!selSize) { showToast('Please select a size first'); return; }
  const p = curProd, key = p.id + '-' + selSize;
  const ex = cart.find((i) => i.key === key);
  if (ex) {
    if (ex.qty >= p.stock) { showToast(`Only ${p.stock} in stock`); return; }
    ex.qty++;
  } else cart.push({ id: p.id, name: p.name, cat: p.cat, emoji: p.emoji, img: p.img, price: priceFor(p, selSize), key, size: selSize, qty: 1 });
  saveCart(); updateCart(); bumpCount();
  showToast(`${p.name} (${selSize}) added to cart!`);
  setTimeout(toggleCart, 400);
}
function buyNow() {
  if (!selSize) { showToast('Please select a size first'); return; }
  const p = curProd;
  const msg = `QUICK ORDER - YK COLLECTION\n\n${p.name} (Size: ${selSize})\nPrice: NGN${priceFor(p, selSize).toLocaleString()}\n\nNationwide Delivery\n\nPlease confirm my order. Thank you!`;
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
}
function updateCart() {
  const total = cart.reduce((t, i) => t + i.price * i.qty, 0);
  const count = cart.reduce((t, i) => t + i.qty, 0);
  $('cc1').textContent = count; $('cc2').textContent = count;
  $('cartTotal').innerHTML = naira(total);
  $('cartSubtitle').textContent = `${count} item${count !== 1 ? 's' : ''}`;
  const box = $('cartItems');
  if (!cart.length) {
    box.innerHTML = "<div class='cart-empty'><div class='cart-empty-icon'>\uD83D\uDED2</div><p>Your cart is empty</p></div>";
    return;
  }
  box.innerHTML = cart.map((it) =>
    `<div class="ci"><div class="ci-thumb">${it.img ? `<img src="${esc(it.img)}" alt=""/>` : esc(it.emoji)}</div>` +
    `<div style="flex:1"><div class="ci-name">${esc(it.name)}</div><div class="ci-size">Size: ${esc(it.size)}</div>` +
    `<div class="ci-price">${naira(it.price * it.qty)}</div><div class="ci-qty">` +
    `<button class="qty-btn" data-act="dec" data-key="${esc(it.key)}">\u2212</button><span class="qty-num">${it.qty}</span>` +
    `<button class="qty-btn" data-act="inc" data-key="${esc(it.key)}">+</button></div>` +
    `<button class="rm-btn" data-act="rm" data-key="${esc(it.key)}">Remove</button></div></div>`).join('');
}
function rmItem(key) { cart = cart.filter((i) => i.key !== key); saveCart(); updateCart(); }
function chQty(key, d) {
  const it = cart.find((i) => i.key === key);
  if (!it) return;
  const p = products.find((x) => x.id === it.id);
  if (d > 0 && p && it.qty >= p.stock) { showToast(`Only ${p.stock} in stock`); return; }
  it.qty += d;
  if (it.qty <= 0) rmItem(key); else { saveCart(); updateCart(); }
}
function toggleCart() {
  $('cartPanel').classList.toggle('open');
  $('cartOverlay').classList.toggle('open');
  document.body.style.overflow = $('cartPanel').classList.contains('open') ? 'hidden' : '';
}
function bumpCount() { const c = $('cc1'); c.classList.add('bump'); setTimeout(() => c.classList.remove('bump'), 400); }
function checkout() {
  if (!cart.length) { showToast('Your cart is empty!'); return; }
  const total = cart.reduce((t, i) => t + i.price * i.qty, 0);
  let msg = 'NEW ORDER - YK COLLECTION\n\nItems Ordered:\n';
  cart.forEach((it) => { msg += `${it.name} (Size: ${it.size}) x${it.qty} - NGN${(it.price * it.qty).toLocaleString()}\n`; });
  msg += `\nTotal: NGN${total.toLocaleString()}\nNationwide Delivery\n\nPlease confirm my order. Thank you!`;
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
}
function joinWhatsApp() {
  const msg = 'Hello YK Collection! I would like to join your WhatsApp list to get updates on new arrivals and special offers.';
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ════════════════════════════════════════════════════════════════
   CONTACT FORM + COMPLAINTS/SUGGESTIONS  → Supabase `feedback` table
   ════════════════════════════════════════════════════════════════ */
let activeCompType = 'complaint';

async function sendFeedback(row, btn) {
  if (!sb) { showToast('Could not send right now. Please use WhatsApp.'); return false; }
  if (btn) btn.classList.add('btn-busy');
  const { error } = await sb.from('feedback').insert(row);
  if (btn) btn.classList.remove('btn-busy');
  if (error) { console.error('Feedback error:', error); showToast('Could not send. Please try again.'); return false; }
  return true;
}
async function submitForm(btn) {
  const fn = $('fn').value.trim(), ln = $('ln').value.trim();
  const em = $('em').value.trim(), ms = $('ms').value.trim();
  if (!fn || !em || !ms) { showToast('Please fill all fields'); return; }
  if (!/^\S+@\S+\.\S+$/.test(em)) { showToast('Please enter a valid email'); return; }
  const ok = await sendFeedback({ type: 'contact', name: (fn + ' ' + ln).trim().slice(0, 80), email: em.slice(0, 120), message: ms.slice(0, 2000) }, btn);
  if (ok) { $('cfWrap').style.display = 'none'; $('fOk').style.display = 'block'; }
}
function setCompType(type, btn) {
  activeCompType = type;
  document.querySelectorAll('.comp-tab').forEach((t) => t.classList.remove('active'));
  btn.classList.add('active');
}
async function submitComplaint(btn) {
  const name = $('compName').value.trim(), msg = $('compMsg').value.trim();
  if (!name) { showToast('Please enter your name'); return; }
  if (!msg) { showToast('Please enter your message'); return; }
  const ok = await sendFeedback({ type: activeCompType, name: name.slice(0, 80), message: msg.slice(0, 2000) }, btn);
  if (ok) { $('compFormWrap').style.display = 'none'; $('compOk').style.display = 'block'; }
}
function resetCompForm() {
  $('compName').value = ''; $('compMsg').value = '';
  $('compFormWrap').style.display = 'block'; $('compOk').style.display = 'none';
}

/* ════════════════════════════════════════════════════════════════
   PRODUCT GALLERY & LIGHTBOX
   ════════════════════════════════════════════════════════════════ */
let galleryIndex = 0, galleryImages = [];
let lightboxZoom = 1, lightboxOffset = { x: 0, y: 0 }, lightboxDragStart = { x: 0, y: 0 }, lightboxPinchDist = 0;
let galleryTouchStartX = 0, galleryTouchStartY = 0;

function buildGallery(p) {
  galleryImages = p.images.length ? p.images.slice() : (p.spinImages.length ? [p.spinImages[0]] : [p.emoji]);
  galleryIndex = 0;
  const wrap = $('detGallery');
  if (!wrap) return;
  const many = galleryImages.length > 1;
  const slides = galleryImages.map((src, i) =>
    `<div class="det-gallery-slide">${isUrl(src) ? `<img src="${esc(src)}" alt="Product photo ${i + 1}"/>` : `<span>${esc(src)}</span>`}</div>`).join('');
  const arrows = many
    ? "<button class='gallery-arrow prev' onclick='event.stopPropagation();galleryPrev()'>&#8592;</button>" +
      "<button class='gallery-arrow next' onclick='event.stopPropagation();galleryNext()'>&#8594;</button>" : '';
  const count = many ? `<div class='gallery-count'>1 / ${galleryImages.length}</div>` : '';
  const dots = (many && galleryImages.length <= 8)
    ? "<div class='gallery-dots'>" + galleryImages.map((_, i) =>
        `<button class='gallery-dot${i === 0 ? ' active' : ''}' onclick='galleryGoTo(${i})'></button>`).join('') + '</div>' : '';
  const spinPill = p.spinEnabled
    ? "<button class='spin-pill' onclick='event.stopPropagation();onGalleryClick()'>&#8635; 360&deg; view</button>" : '';
  wrap.innerHTML = `<div class='det-gallery-main' onclick='onGalleryClick()' id='galleryMain'>` +
    `<div class='det-gallery-slides' id='gallerySlides'>${slides}</div>${arrows}${count}${spinPill}</div>${dots}`;

  const main = $('galleryMain');
  main.addEventListener('touchstart', (e) => {
    galleryTouchStartX = e.touches[0].clientX; galleryTouchStartY = e.touches[0].clientY;
  }, { passive: true });
  main.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - galleryTouchStartX;
    const dy = e.changedTouches[0].clientY - galleryTouchStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) { if (dx < 0) galleryNext(); else galleryPrev(); }
  }, { passive: true });
}
function galleryGoTo(idx) {
  if (!galleryImages.length) return;
  galleryIndex = Math.max(0, Math.min(idx, galleryImages.length - 1));
  const slides = $('gallerySlides');
  if (slides) slides.style.transform = `translateX(-${galleryIndex * 100}%)`;
  document.querySelectorAll('.gallery-dot').forEach((d, i) => d.classList.toggle('active', i === galleryIndex));
  const c = document.querySelector('.gallery-count');
  if (c) c.textContent = `${galleryIndex + 1} / ${galleryImages.length}`;
}
function galleryNext() { galleryGoTo((galleryIndex + 1) % galleryImages.length); }
function galleryPrev() { galleryGoTo((galleryIndex - 1 + galleryImages.length) % galleryImages.length); }

function renderLightboxImg(idx) {
  const src = galleryImages[idx];
  return isUrl(src)
    ? `<img src="${esc(src)}" style="max-width:95vw;max-height:80vh;object-fit:contain;border-radius:8px;cursor:grab" draggable="false"/>`
    : `<span style="font-size:8rem">${esc(src)}</span>`;
}
function openLightbox(idx) {
  const lb = $('lightbox');
  if (!lb || !galleryImages.length) return;
  lightboxZoom = 1; lightboxOffset = { x: 0, y: 0 };
  $('lbImg').innerHTML = renderLightboxImg(idx);
  const thumbs = $('lbThumbs');
  thumbs.innerHTML = galleryImages.length > 1 ? galleryImages.map((src, i) =>
    `<div class='lightbox-thumb${i === idx ? ' active' : ''}' onclick='lbGoTo(${i})'>${isUrl(src) ? `<img src="${esc(src)}"/>` : `<span>${esc(src)}</span>`}</div>`).join('') : '';
  updateLightboxCounter(idx);
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
  const hint = $('lbZoomHint');
  if (hint) { hint.style.display = 'block'; hint.style.animation = 'fadeOut 3s forwards'; }
  setupPinchZoom();
}
function closeLightbox() {
  const lb = $('lightbox');
  if (lb) lb.classList.remove('open');
  document.body.style.overflow = '';
  lightboxZoom = 1; lightboxOffset = { x: 0, y: 0 };
}
function lbGoTo(idx) {
  idx = Math.max(0, Math.min(idx, galleryImages.length - 1));
  galleryIndex = idx;
  $('lbImg').innerHTML = renderLightboxImg(idx);
  applyLightboxTransform();
  document.querySelectorAll('.lightbox-thumb').forEach((t, i) => t.classList.toggle('active', i === idx));
  updateLightboxCounter(idx);
  setupPinchZoom();
}
function lbNext() { lbGoTo((galleryIndex + 1) % galleryImages.length); }
function lbPrev() { lbGoTo((galleryIndex - 1 + galleryImages.length) % galleryImages.length); }
function updateLightboxCounter(idx) { const c = $('lbCounter'); if (c) c.textContent = `${idx + 1} of ${galleryImages.length}`; }
function applyLightboxTransform() {
  const img = document.querySelector('#lbImg img');
  if (img) img.style.transform = `scale(${lightboxZoom}) translate(${lightboxOffset.x}px,${lightboxOffset.y}px)`;
}
function setupPinchZoom() {
  const wrap = $('lbImgWrap');
  if (!wrap) return;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  wrap.onwheel = (e) => {
    e.preventDefault();
    lightboxZoom = Math.max(1, Math.min(4, lightboxZoom + (e.deltaY < 0 ? 0.2 : -0.2)));
    if (lightboxZoom === 1) lightboxOffset = { x: 0, y: 0 };
    applyLightboxTransform();
  };
  wrap.ontouchstart = (e) => {
    if (e.touches.length === 2) lightboxPinchDist = dist(e.touches);
    else if (e.touches.length === 1) lightboxDragStart = { x: e.touches[0].clientX - lightboxOffset.x, y: e.touches[0].clientY - lightboxOffset.y };
  };
  wrap.ontouchmove = (e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const d = dist(e.touches);
      lightboxZoom = Math.max(1, Math.min(4, lightboxZoom * (d / lightboxPinchDist)));
      lightboxPinchDist = d;
      if (lightboxZoom === 1) lightboxOffset = { x: 0, y: 0 };
      applyLightboxTransform();
    } else if (e.touches.length === 1 && lightboxZoom > 1) {
      lightboxOffset = { x: e.touches[0].clientX - lightboxDragStart.x, y: e.touches[0].clientY - lightboxDragStart.y };
      applyLightboxTransform();
    }
  };
  wrap.ontouchend = () => { if (lightboxZoom <= 1) { lightboxZoom = 1; lightboxOffset = { x: 0, y: 0 }; } };
}
document.addEventListener('keydown', (e) => {
  const lb = $('lightbox');
  if (!lb || !lb.classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowRight') lbNext();
  if (e.key === 'ArrowLeft') lbPrev();
});

/* ════════════════════════════════════════════════════════════════
   360° VIEWER — drag (mouse) or swipe (finger) to turn a product through a ring of photos
   ════════════════════════════════════════════════════════════════ */
function createSpin(stage, frames) {
  const N = frames.length;
  const canvas = document.createElement('canvas');
  canvas.className = 'spin-canvas';
  const loader = document.createElement('div');
  loader.className = 'spin-loading';
  loader.textContent = 'Loading 360\u00B0 view\u2026 0%';
  const hint = document.createElement('div');
  hint.className = 'spin-hint';
  hint.innerHTML = '&#8596; Drag to rotate';
  stage.innerHTML = '';
  stage.appendChild(canvas); stage.appendChild(loader); stage.appendChild(hint);
  const ctx = canvas.getContext('2d');
  const imgs = new Array(N);
  let loaded = 0, ready = false, dead = false;
  let pos = 0, vel = 0, dragging = false, lastX = 0, raf = 0;
  let auto = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let autoLast = 0, autoSpun = 0;
  const idx = () => ((Math.round(pos) % N) + N) % N;

  function draw() {
    let j = idx();
    for (let k = 0; k < N && !(imgs[j] && imgs[j].naturalWidth); k++) j = (j + 1) % N;   // skip frames that failed to load
    const im = imgs[j];
    const cw = canvas.width, ch = canvas.height;
    if (!im || !im.naturalWidth || !cw || !ch) return;
    ctx.clearRect(0, 0, cw, ch);
    const sc = Math.min(cw / im.naturalWidth, ch / im.naturalHeight);
    const w = im.naturalWidth * sc, h = im.naturalHeight * sc;
    ctx.drawImage(im, (cw - w) / 2, (ch - h) / 2, w, h);
  }
  function resize() {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    draw();
  }
  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(stage); else window.addEventListener('resize', resize);
  resize();

  function autoTick(ts) {                         // one gentle turn to show it's 3D, then stop
    if (dead || !auto || dragging) return;
    if (!autoLast) autoLast = ts;
    const adv = N * (ts - autoLast) / 7000;
    autoLast = ts; pos += adv; autoSpun += adv;
    draw();
    if (autoSpun >= N) { auto = false; return; }
    raf = requestAnimationFrame(autoTick);
  }
  frames.forEach((src, i) => {
    const im = new Image();
    im.onload = im.onerror = () => {
      if (dead) return;
      loaded++;
      if (im.naturalWidth) imgs[i] = im;
      loader.textContent = `Loading 360\u00B0 view\u2026 ${Math.round(loaded / N * 100)}%`;
      if (loaded === N) {
        ready = true; loader.style.display = 'none'; hint.classList.add('show'); draw();
        if (auto) raf = requestAnimationFrame(autoTick);
      }
    };
    im.src = src;
  });

  const perFrame = () => Math.max(4, stage.clientWidth / N);   // dragging across the stage ≈ one full turn
  function down(e) {
    if (!ready || (typeof e.button === 'number' && e.button > 0)) return;
    dragging = true; auto = false; vel = 0; lastX = e.clientX;
    cancelAnimationFrame(raf);
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    stage.classList.add('grabbing'); hint.classList.remove('show');
  }
  function move(e) {
    if (!dragging) return;
    const df = -(e.clientX - lastX) / perFrame();
    lastX = e.clientX;
    pos += df; vel = vel * 0.6 + df * 0.4;
    draw();
  }
  function up() {
    if (!dragging) return;
    dragging = false; stage.classList.remove('grabbing');
    const glide = () => {                         // keep turning briefly after the finger lifts
      if (dead || dragging) return;
      pos += vel; vel *= 0.93; draw();
      if (Math.abs(vel) > 0.02) raf = requestAnimationFrame(glide);
    };
    raf = requestAnimationFrame(glide);
  }
  stage.addEventListener('pointerdown', down);
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);

  return {
    step(n) { if (!ready) return; auto = false; cancelAnimationFrame(raf); hint.classList.remove('show'); pos = Math.round(pos) + n; draw(); },
    destroy() {
      dead = true; cancelAnimationFrame(raf);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
      stage.removeEventListener('pointerdown', down); stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up); stage.removeEventListener('pointercancel', up);
      stage.innerHTML = '';
    },
    get frame() { return idx(); },
    get ready() { return ready; }
  };
}

let spinCtl = null;
function openSpinViewer(frames, opts) {
  opts = opts || {};
  if (!frames || frames.length < 2) { showToast('No 360\u00B0 photos yet'); return; }
  if (spinCtl) spinCtl.destroy();
  $('spinTitle').textContent = opts.title || '';
  $('spinPhotosBtn').style.display = opts.photos ? 'inline-flex' : 'none';
  $('spinOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  spinCtl = createSpin($('spinStage'), frames);
}
function closeSpinViewer() {
  if (spinCtl) { spinCtl.destroy(); spinCtl = null; }
  $('spinOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
function spinStep(n) { if (spinCtl) spinCtl.step(n); }
function spinToPhotos() { closeSpinViewer(); openLightbox(0); }
// Tapping the product image: 360° products open the spinner, the rest open the normal zoom viewer
function onGalleryClick() {
  if (curProd && curProd.spinEnabled) {
    openSpinViewer(curProd.spinImages, { title: curProd.name, photos: curProd.images.length > 0 });
  } else openLightbox(galleryIndex);
}
document.addEventListener('keydown', (e) => {
  const o = $('spinOverlay');
  if (!o || !o.classList.contains('open')) return;
  if (e.key === 'Escape') closeSpinViewer();
  if (e.key === 'ArrowLeft') spinStep(-1);
  if (e.key === 'ArrowRight') spinStep(1);
});

/* ════════════════════════════════════════════════════════════════
   THEME (light / dark)
   ════════════════════════════════════════════════════════════════ */
let currentTheme = 'light';
try { currentTheme = localStorage.getItem('yk_theme') || 'light'; } catch (e) { /* ignore */ }
let _slideRunning = false;
function updateThemeBtn(theme) {
  document.querySelectorAll('.theme-toggle').forEach((b) => { b.innerHTML = theme === 'dark' ? '&#9728;' : '&#9790;'; });
}
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeBtn(theme);
  currentTheme = theme;
  try { localStorage.setItem('yk_theme', theme); } catch (e) { /* ignore */ }
}
function applyTheme(theme, animate) {
  if (!animate || _slideRunning) { setTheme(theme); return; }
  _slideRunning = true;
  const w = document.createElement('div');
  w.style.cssText = 'position:fixed;top:0;left:0;right:0;height:100vh;z-index:99999;pointer-events:none;overflow:hidden;transform:translateY(-100%);transition:transform 1s cubic-bezier(0.25,0.1,0.1,1)';
  const inner = document.createElement('div');
  inner.style.cssText = `position:absolute;inset:0;background:${theme === 'dark' ? '#080c14' : '#f0f9ff'};display:flex;align-items:center;justify-content:center`;
  inner.innerHTML = `<div style="font-size:3rem">${theme === 'dark' ? '&#127769;' : '&#9728;'}</div>`;
  w.appendChild(inner);
  document.body.appendChild(w);
  w.getBoundingClientRect();
  w.style.transform = 'translateY(0%)';
  setTimeout(() => setTheme(theme), 500);
  setTimeout(() => {
    w.style.transition = 'transform 0.4s ease-in';
    w.style.transform = 'translateY(100%)';
    setTimeout(() => { if (w.parentNode) w.parentNode.removeChild(w); _slideRunning = false; }, 450);
  }, 1100);
}
function toggleTheme() { if (!_slideRunning) applyTheme(currentTheme === 'light' ? 'dark' : 'light', true); }
applyTheme(currentTheme, false);

/* ════════════════════════════════════════════════════════════════
   LANDING PARTICLES
   ════════════════════════════════════════════════════════════════ */
(function particles() {
  const canvas = $('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const colors = ['#38bdf8', '#7dd3fc', '#bae6fd', '#0ea5e9', '#ffffff', '#e0f2fe'];
  let W, H;
  const resize = () => { W = canvas.width = canvas.offsetWidth; H = canvas.height = canvas.offsetHeight; };
  resize();
  window.addEventListener('resize', resize);
  class Particle {
    constructor(startAnywhere) { this.reset(); if (startAnywhere) this.y = Math.random() * H; }
    reset() {
      this.x = Math.random() * W; this.y = Math.random() * H + H;
      this.r = Math.random() * 3 + 1;
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.speedY = -(Math.random() * 1.5 + 0.5); this.speedX = (Math.random() - 0.5) * 0.8;
      this.opacity = Math.random() * 0.6 + 0.2;
      this.wobble = Math.random() * Math.PI * 2; this.wobbleSpeed = Math.random() * 0.03 + 0.01;
      this.shape = Math.random() > 0.5 ? 'circle' : 'square';
      this.rotation = Math.random() * Math.PI * 2; this.rotSpeed = (Math.random() - 0.5) * 0.05;
    }
    update() {
      this.wobble += this.wobbleSpeed;
      this.x += this.speedX + Math.sin(this.wobble) * 0.5;
      this.y += this.speedY; this.rotation += this.rotSpeed;
      if (this.y < -20) this.reset();
    }
    draw() {
      ctx.save(); ctx.globalAlpha = this.opacity; ctx.fillStyle = this.color;
      ctx.translate(this.x, this.y); ctx.rotate(this.rotation);
      if (this.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-this.r, -this.r, this.r * 2, this.r * 2);
      ctx.restore();
    }
  }
  const list = Array.from({ length: 80 }, () => new Particle(true));
  (function animate() {
    const landing = $('landing');
    if (landing && landing.classList.contains('active')) {
      ctx.clearRect(0, 0, W, H);
      list.forEach((p) => { p.update(); p.draw(); });
    }
    requestAnimationFrame(animate);
  })();
})();

/* ════════════════════════════════════════════════════════════════
   START
   ════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  $('cartItems').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'rm') rmItem(b.dataset.key);
    else chQty(b.dataset.key, b.dataset.act === 'inc' ? 1 : -1);
  });
  $('shopFilterBar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-special]');
    if (b) filterSpecial(b.dataset.special);
  });
  $('sizeChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-size]');
    if (b) toggleSizeChip(b.dataset.size);
  });
  loadCart();
  buildShopFilterBar();
  loadStore();
});
