function getAvgRating(p) {
  var data = p.reviewData || (allReviews && allReviews[p.id]);
  if (!data || !data.length) return '';
  var t = 0; for (var i=0;i<data.length;i++) t+=data[i].stars;
  return (t/data.length).toFixed(1);
}

/* ── REVIEWS SYSTEM ── */

function openReviewForm(productId) {
  selectedStars = 0;
  document.getElementById('reviewName').value = '';
  document.getElementById('reviewText').value = '';
  updateStarPicker(0);
  document.getElementById('reviewForm').classList.add('open');
  document.getElementById('reviewForm').scrollIntoView({behavior:'smooth', block:'nearest'});
}

function closeReviewForm() {
  document.getElementById('reviewForm').classList.remove('open');
}

function updateStarPicker(n) {
  var stars = document.querySelectorAll('.star-pick');
  for (var i = 0; i < stars.length; i++) {
    stars[i].classList.toggle('lit', i < n);
  }
  selectedStars = n;
}

function hoverStar(n) { 
  var stars = document.querySelectorAll('.star-pick');
  for (var i = 0; i < stars.length; i++) stars[i].classList.toggle('lit', i < n);
}
function unhoverStar() { updateStarPicker(selectedStars); }

function submitReview() {
  if (!curProd) return;
  var name = document.getElementById('reviewName').value.trim();
  if (!name) { showToast('Please enter your name'); return; }
  if (!selectedStars) { showToast('Please select a star rating'); return; }
  var text = document.getElementById('reviewText').value.trim();
  var now = new Date();
  var dateStr = now.toLocaleDateString('en-NG', {day:'numeric', month:'short', year:'numeric'});
  var id = curProd.id;
  if (!allReviews[id]) allReviews[id] = [];
  allReviews[id].push({name:name, stars:selectedStars, text:text, date:dateStr});

  // Update product rating
  var total = 0;
  for (var i = 0; i < allReviews[id].length; i++) total += allReviews[id][i].stars;
  var avg = total / allReviews[id].length;
  for (var i = 0; i < products.length; i++) {
    if (products[i].id === id) {
      products[i].reviews = allReviews[id].length;
      products[i].reviewData = allReviews[id];
      break;
    }
  }
  saveProductsToStorage();
  renderReviews(id);
  closeReviewForm();
  showToast('Thank you for your review! \u2605');
}

function renderReviews(productId) {
  var box = document.getElementById('reviewsList');
  var summary = document.getElementById('reviewsSummary');
  if (!box) return;
  var revs = allReviews[productId] || [];
  
  // Summary
  if (revs.length) {
    var total = 0;
    for (var i = 0; i < revs.length; i++) total += revs[i].stars;
    var avg = (total / revs.length).toFixed(1);
    var stars = '';
    for (var i = 1; i <= 5; i++) stars += i <= Math.round(avg) ? '\u2605' : '\u2606';
    summary.innerHTML = "<span class='reviews-avg'>" + avg + "</span><div><div class='reviews-avg-stars'>" + stars + "</div><div class='reviews-avg-count'>" + revs.length + " review" + (revs.length!==1?'s':'') + "</div></div>";
    summary.style.display = 'flex';
  } else {
    summary.style.display = 'none';
  }

  if (!revs.length) {
    box.innerHTML = "<div class='no-reviews'>No reviews yet. Be the first to review this product!</div>";
    return;
  }
  var html = '';
  for (var i = revs.length - 1; i >= 0; i--) {
    var r = revs[i];
    var stars = '';
    for (var j = 1; j <= 5; j++) stars += j <= r.stars ? '\u2605' : '\u2606';
    html += "<div class='review-item'>";
    html += "<div class='review-meta'><span class='review-name'>" + r.name + "</span><span class='review-date'>" + r.date + "</span></div>";
    html += "<div class='review-stars'>" + stars + "</div>";
    if (r.text) html += "<div class='review-text'>" + r.text + "</div>";
    html += "</div>";
  }
  box.innerHTML = html;
}

/* Load saved reviews from storage */
(function(){
  try {
    var saved = localStorage.getItem('yk_reviews_v1');
    if (saved) allReviews = JSON.parse(saved);
  } catch(e) {}
})();

/* Override saveProductsToStorage to also save reviews */
var _origSaveProd = saveProductsToStorage;
saveProductsToStorage = function() {
  _origSaveProd();
  try { localStorage.setItem('yk_reviews_v1', JSON.stringify(allReviews)); } catch(e) {}
};

/* Override openProd to load reviews */
var _origOpenProdGallery = openProd;
openProd = function(id) {
  _origOpenProdGallery(id);
  // Load existing review data
  var p = null;
  for (var i = 0; i < products.length; i++) { if (products[i].id === id) { p = products[i]; break; } }
  if (p && p.reviewData) allReviews[id] = p.reviewData;
  setTimeout(function(){ renderReviews(id); }, 100);
};

/* ── FLOATING WHATSAPP ── */
function initWaFloat() {
  var btn = document.getElementById('waFloat');
  if (!btn) return;
  window.addEventListener('scroll', function() {
    var landing = document.getElementById('landing');
    if (landing && landing.classList.contains('active')) {
      btn.classList.remove('visible');
    } else {
      btn.classList.add('visible');
    }
  });
  // Also show/hide on page change - patch go()
  var _origGo = go;
  go = function(name) {
    _origGo(name);
    setTimeout(function() {
      if (btn) btn.classList.toggle('visible', name !== 'landing');
    }, 350);
  };
}
document.addEventListener('DOMContentLoaded', function(){ initWaFloat(); });
setTimeout(initWaFloat, 500);

/* ── META TAGS + FAVICON added via JS ── */
(function(){
  // Meta description
  var meta = document.createElement('meta');
  meta.name = 'description';
  meta.content = 'YK Collection - Premium fashion for men and women. Shop quality clothing, shoes, bags and accessories. Nationwide delivery across Nigeria. Order via WhatsApp.';
  document.head.appendChild(meta);
  // OG tags
  var tags = [
    {property:'og:title', content:'YK Collection - Premium Fashion Store'},
    {property:'og:description', content:'Shop premium clothing, shoes and accessories for men and women. Nationwide delivery. Order via WhatsApp.'},
    {property:'og:type', content:'website'},
    {name:'twitter:card', content:'summary_large_image'}
  ];
  tags.forEach(function(t) {
    var m = document.createElement('meta');
    if (t.property) m.setAttribute('property', t.property);
    if (t.name) m.setAttribute('name', t.name);
    m.content = t.content;
    document.head.appendChild(m);
  });
  // Favicon - YK emoji favicon
  var link = document.createElement('link');
  link.rel = 'icon';
  link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%2338bdf8"/><text y=".9em" font-size="65" font-family="serif" font-weight="900" x="50%" text-anchor="middle" fill="white">YK</text></svg>';
  document.head.appendChild(link);
})();


/* ── SHOP CATEGORY SYSTEM ── */
var shopCategories = {
  men: [
    {id:'clothing-male', label:'Clothing'},
    {id:'shoes-male', label:'Shoes'},
    {id:'bags-male', label:'Bags'},
    {id:'watches-male', label:'Watches & Accessories'}
  ],
  women: [
    {id:'clothing-female', label:'Clothing'},
    {id:'shoes-female', label:'Shoes'},
    {id:'bags-female', label:'Bags'},
    {id:'watches-female', label:'Watches'},
    {id:'jewelry-female', label:'Jewelry & Accessories'}
  ]
};

var comingSoonCats = {'jewelry-female': true};
var comingSoonSpecial = {newArrivals: false, sale: false};
var activeFilterCat = 'all';
var activeFilterSpecial = 'all';

function buildShopFilterBar() {
  var bar = document.getElementById('shopFilterBar');
  if (!bar) return;

  function makeMenItems() {
    var html = '';
    shopCategories.men.forEach(function(cat) {
      var soon = comingSoonCats[cat.id] ? true : false;
      var activeClass = activeFilterCat === cat.id ? ' active' : '';
      if (soon) {
        html += '<button class="filter-dd-item' + activeClass + '" disabled style="opacity:.5;cursor:default;pointer-events:none">' + cat.label + '<span class="dd-soon">Soon</span></button>';
      } else {
        html += '<button class="filter-dd-item' + activeClass + '" data-cat="' + cat.id + '">' + cat.label + '</button>';
      }
    });
    return html;
  }

  function makeWomenItems() {
    var html = '';
    shopCategories.women.forEach(function(cat) {
      var soon = comingSoonCats[cat.id] ? true : false;
      var activeClass = activeFilterCat === cat.id ? ' active' : '';
      if (soon) {
        html += '<button class="filter-dd-item' + activeClass + '" disabled style="opacity:.5;cursor:default;pointer-events:none">' + cat.label + '<span class="dd-soon">Soon</span></button>';
      } else {
        html += '<button class="filter-dd-item' + activeClass + '" data-cat="' + cat.id + '">' + cat.label + '</button>';
      }
    });
    return html;
  }

  var naSoon = comingSoonSpecial.newArrivals;
  var saleSoon = comingSoonSpecial.sale;

  bar.innerHTML =
    '<div class="shop-filter-inner">' +
    '<div class="filter-special">' +
    '<button class="filter-tab' + (activeFilterSpecial==='all'?' active':'') + '" data-special="all">All</button>' +
    '<button class="filter-tab' + (activeFilterSpecial==='new'?' active':'') + '" data-special="new">New Arrivals' + (naSoon ? '<span class="tab-soon">Soon</span>' : '') + '</button>' +
    '<button class="filter-tab' + (activeFilterSpecial==='sale'?' active':'') + '" data-special="sale">Sale / Deals' + (saleSoon ? '<span class="tab-soon">Soon</span>' : '') + '</button>' +
    '</div>' +
    '<div class="filter-groups">' +
    '<div class="filter-dropdown" id="ddMen">' +
    '<button class="filter-dropdown-btn" data-toggle="ddMen"><span>Men</span><span class="arrow">&#9660;</span></button>' +
    '<div class="filter-dropdown-menu"><div class="filter-dd-section"><div class="filter-dd-label">Men\'s Categories</div>' + makeMenItems() + '</div></div>' +
    '</div>' +
    '<div class="filter-dropdown" id="ddWomen">' +
    '<button class="filter-dropdown-btn" data-toggle="ddWomen"><span>Women</span><span class="arrow">&#9660;</span></button>' +
    '<div class="filter-dropdown-menu"><div class="filter-dd-section"><div class="filter-dd-label">Women\'s Categories</div>' + makeWomenItems() + '</div></div>' +
    '</div>' +
    '</div></div>' +
    '<div class="active-filter-strip" id="activeFilterStrip"></div>';

  // Attach events using event delegation
  bar.addEventListener('click', function(e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    // Category filter
    var cat = btn.getAttribute('data-cat');
    if (cat) { filterByCat(cat); return; }
    // Special filter
    var special = btn.getAttribute('data-special');
    if (special !== null) { filterSpecial(special); return; }
    // Dropdown toggle
    var toggle = btn.getAttribute('data-toggle');
    if (toggle) { toggleDropdown(toggle); return; }
  });
}

function toggleDropdown(id) {
  var dd = document.getElementById(id);
  if (!dd) return;
  var isOpen = dd.classList.contains('open');
  // Close all
  document.querySelectorAll('.filter-dropdown').forEach(function(el){ el.classList.remove('open'); });
  if (!isOpen) dd.classList.add('open');
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.filter-dropdown')) {
    document.querySelectorAll('.filter-dropdown').forEach(function(el){ el.classList.remove('open'); });
  }
});

function filterByCat(cat) {
  activeFilterCat = cat;
  activeFilterSpecial = 'all';
  document.querySelectorAll('.filter-dropdown').forEach(function(el){ el.classList.remove('open'); });
  var list = products.filter(function(p){ return p.cat === cat; });
  renderProds(list);
  updateActiveFilterStrip(catMap[cat] || cat, 'cat');
  buildShopFilterBar();
}

function filterSpecial(type) {
  activeFilterSpecial = type;
  activeFilterCat = 'all';
  document.querySelectorAll('.filter-dropdown').forEach(function(el){ el.classList.remove('open'); });
  var list;
  if (type === 'all') {
    list = products;
    clearActiveFilterStrip();
  } else if (type === 'new') {
    if (comingSoonSpecial.newArrivals) { showToast('New Arrivals coming soon!'); return; }
    list = products.filter(function(p){ return p.badge === 'new'; });
    updateActiveFilterStrip('New Arrivals', 'special');
  } else if (type === 'sale') {
    if (comingSoonSpecial.sale) { showToast('Sale / Deals coming soon!'); return; }
    list = products.filter(function(p){ return p.badge === 'sale'; });
    updateActiveFilterStrip('Sale / Deals', 'special');
  }
  renderProds(list);
  buildShopFilterBar();
}

function updateActiveFilterStrip(label, type) {
  var strip = document.getElementById('activeFilterStrip');
  if (!strip) return;
  strip.classList.add('show');
  strip.innerHTML = "<div class='active-filter-chip'>" + label +
    "<button onclick='clearActiveFilter()'>&#10005;</button></div>" +
    "<span class='filter-result-count' id='resultCount'></span>";
}

function clearActiveFilter() {
  activeFilterCat = 'all';
  activeFilterSpecial = 'all';
  renderProds(products);
  clearActiveFilterStrip();
  buildShopFilterBar();
}

function clearActiveFilterStrip() {
  var strip = document.getElementById('activeFilterStrip');
  if (strip) { strip.classList.remove('show'); strip.innerHTML = ''; }
}

/* Override filterGo to work with new system */
filterGo = function(cat) {
  go('shop');
  setTimeout(function(){ filterByCat(cat); }, 350);
};

/* Override search to reset filter bar */
var _origHandleSearch = handleSearch;
handleSearch = function() {
  activeFilterCat = 'all';
  activeFilterSpecial = 'all';
  _origHandleSearch();
  clearActiveFilterStrip();
  buildShopFilterBar();
};

/* ── ADMIN: MANAGE COMING SOON CATEGORIES ── */
function renderAdminCatManager() {
  var box = document.getElementById('adminCatManager');
  if (!box) return;

  var allCats = [].concat(shopCategories.men, shopCategories.women, shopCategories.unisex || []);
  var html = "<div style='margin-bottom:1rem'>";
  html += "<div class='admin-f-lbl' style='margin-bottom:.75rem;font-size:.8rem'>Toggle categories between Active and Coming Soon:</div>";

  allCats.forEach(function(cat) {
    var isSoon = comingSoonCats[cat.id] ? true : false;
    html += "<div style='display:flex;align-items:center;justify-content:space-between;padding:.65rem 0;border-bottom:1px solid var(--border)'>";
    html += "<span style='font-size:.88rem;color:var(--text);font-weight:500'>" + cat.label + "</span>";
    html += "<button onclick='toggleCatSoon(\""+cat.id+"\")' style='padding:.4rem 1rem;border-radius:50px;font-size:.75rem;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;border:1px solid;transition:all .2s;" +
      (isSoon ? "background:rgba(245,158,11,.12);color:#f59e0b;border-color:rgba(245,158,11,.3)" : "background:rgba(34,197,94,.1);color:var(--green);border-color:rgba(34,197,94,.25)") + "'>" +
      (isSoon ? '&#128683; Coming Soon' : '&#9989; Active') + "</button>";
    html += "</div>";
  });

  html += "</div>";
  html += "<div class='admin-f-lbl' style='margin:.75rem 0;font-size:.8rem'>Special sections:</div>";
  html += "<div style='display:flex;align-items:center;justify-content:space-between;padding:.65rem 0;border-bottom:1px solid var(--border)'>";
  html += "<span style='font-size:.88rem;color:var(--text);font-weight:500'>New Arrivals tab</span>";
  html += "<button onclick='toggleSpecialSoon(\"newArrivals\")' style='padding:.4rem 1rem;border-radius:50px;font-size:.75rem;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;border:1px solid;transition:all .2s;" +
    (comingSoonSpecial.newArrivals ? "background:rgba(245,158,11,.12);color:#f59e0b;border-color:rgba(245,158,11,.3)" : "background:rgba(34,197,94,.1);color:var(--green);border-color:rgba(34,197,94,.25)") + "'>" +
    (comingSoonSpecial.newArrivals ? '&#128683; Coming Soon' : '&#9989; Active') + "</button>";
  html += "</div>";
  html += "<div style='display:flex;align-items:center;justify-content:space-between;padding:.65rem 0'>";
  html += "<span style='font-size:.88rem;color:var(--text);font-weight:500'>Sale / Deals tab</span>";
  html += "<button onclick='toggleSpecialSoon(\"sale\")' style='padding:.4rem 1rem;border-radius:50px;font-size:.75rem;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;border:1px solid;transition:all .2s;" +
    (comingSoonSpecial.sale ? "background:rgba(245,158,11,.12);color:#f59e0b;border-color:rgba(245,158,11,.3)" : "background:rgba(34,197,94,.1);color:var(--green);border-color:rgba(34,197,94,.25)") + "'>" +
    (comingSoonSpecial.sale ? '&#128683; Coming Soon' : '&#9989; Active') + "</button>";
  html += "</div>";

  box.innerHTML = html;
}

function toggleCatSoon(catId) {
  if (comingSoonCats[catId]) delete comingSoonCats[catId];
  else comingSoonCats[catId] = true;
  saveCatSettings();
  buildShopFilterBar();
  renderAdminCatManager();
  showToast('Category updated!');
}

function toggleSpecialSoon(key) {
  comingSoonSpecial[key] = !comingSoonSpecial[key];
  saveCatSettings();
  buildShopFilterBar();
  renderAdminCatManager();
  showToast('Section updated!');
}

function saveCatSettings() {
  try {
    localStorage.setItem('yk_cat_settings', JSON.stringify({
      comingSoonCats: comingSoonCats,
      comingSoonSpecial: comingSoonSpecial
    }));
  } catch(e) {}
}

function loadCatSettings() {
  try {
    var saved = localStorage.getItem('yk_cat_settings');
    if (saved) {
      var data = JSON.parse(saved);
      if (data.comingSoonCats) comingSoonCats = data.comingSoonCats;
      if (data.comingSoonSpecial) comingSoonSpecial = data.comingSoonSpecial;
    }
  } catch(e) {}
}

/* Init */
loadCatSettings();
setTimeout(function(){
  buildShopFilterBar();
  renderAdminCatManager();
}, 100);

/* ---- second inline block (was separate <script> tag) ---- */

var products=[
  {id:1,name:"Classic White Polo",cat:"clothing-male",emoji:"\uD83D\uDC55",img:null,price:20000,oldPrice:null,badge:"new",rating:"\u2605\u2605\u2605\u2605\u2605",reviews:24,sizes:["S","M","L","XL","XXL"],soldOut:false,color:"White",material:"Cotton Blend",description:"A timeless classic white polo crafted from premium cotton blend. Perfect for casual outings, office wear, or a smart-casual look. Breathable fabric keeps you comfortable all day."},
  {id:2,name:"Floral Summer Dress",cat:"clothing-female",emoji:"\uD83D\uDCF9",img:null,price:18500,oldPrice:22000,badge:"sale",rating:"\u2605\u2605\u2605\u2605\u2606",reviews:18,sizes:["XS","S","M","L"],soldOut:false,color:"Floral Print",material:"Chiffon",description:"A beautiful flowing floral dress made from lightweight chiffon. The vibrant print and relaxed silhouette make it ideal for summer events, outings, and special occasions."},
  {id:3,name:"Men Slim Chinos",cat:"clothing-male",emoji:"\uD83D\uDC56",img:null,price:15000,oldPrice:null,badge:null,rating:"\u2605\u2605\u2605\u2605\u2605",reviews:31,sizes:["28","30","32","34","36"],soldOut:false,color:"Khaki",material:"Cotton",description:"Slim fit chinos that combine comfort with a sharp look. Made from durable cotton. Pairs perfectly with a polo, shirt, or t-shirt for any occasion."},
  {id:4,name:"Ladies Crop Top",cat:"clothing-female",emoji:"\uD83D\uDC5A",img:null,price:9500,oldPrice:12000,badge:"sale",rating:"\u2605\u2605\u2605\u2606\u2606",reviews:15,sizes:["XS","S","M","L"],soldOut:false,color:"Black",material:"Jersey",description:"A stylish versatile crop top in smooth jersey fabric. Easy to style with high-waist jeans, skirts, or shorts. A wardrobe essential for every modern woman."},
  {id:5,name:"Men Sneakers",cat:"shoes-male",emoji:"\uD83D\uDC5F",img:null,price:35000,oldPrice:null,badge:"new",rating:"\u2605\u2605\u2605\u2605\u2605",reviews:42,sizes:["40","41","42","43","44","45"],soldOut:false,color:"White/Navy",material:"Leather",description:"Premium leather sneakers with a clean minimalist design. Cushioned insole for all-day comfort. Versatile for casual wear, gym, or smart-casual outfits."},
  {id:6,name:"Ladies Block Heels",cat:"shoes-female",emoji:"\uD83D\uDC60",img:null,price:28000,oldPrice:32000,badge:"sale",rating:"\u2605\u2605\u2605\u2605\u2606",reviews:22,sizes:["36","37","38","39","40"],soldOut:false,color:"Nude",material:"Suede",description:"Elegant block heels in a classic nude tone. The stable block heel provides comfort and height. Perfect for office, dinners, or events."},
  {id:7,name:"Men Ankara Shirt",cat:"clothing-male",emoji:"\uD83C\uDFDB",img:null,price:12000,oldPrice:null,badge:"limited",rating:"\u2605\u2605\u2605\u2605\u2605",reviews:9,sizes:["S","M","L","XL"],soldOut:false,color:"Ankara Print",material:"Cotton",description:"A bold Ankara print shirt celebrating African heritage. Made from quality cotton with vibrant patterns. Stand out at any event, party, or casual gathering."},
  {id:8,name:"Ladies Loafers",cat:"shoes-female",emoji:"\uD83E\uDD35",img:null,price:22000,oldPrice:null,badge:"new",rating:"\u2605\u2605\u2605\u2605\u2605",reviews:17,sizes:["36","37","38","39","40","41"],soldOut:false,color:"Brown",material:"Genuine Leather",description:"Classic genuine leather loafers blending comfort and style. Slip-on design makes them easy to wear every day. Goes well with trousers, jeans, or skirts."}
];
var curProd=null,selSize=null,cart=[];
var allReviews={};
var selectedStars=0;
var catMap={"clothing-male":"Male Clothing","clothing-female":"Female Clothing","shoes-male":"Male Shoes","shoes-female":"Female Shoes","bags-male":"Male Bags","watches-male":"Male Watches","watches-female":"Female Watches","jewelry-female":"Female Jewelry","jerseys":"Jerseys"};

function go(name){
  var cur=document.querySelector(".page.active");
  var next=document.getElementById(name);
  if(!next||next===cur)return;
  if(cur){
    cur.style.opacity="0";cur.style.transform="translateY(-15px)";
    setTimeout(function(){
      cur.classList.remove("active");cur.style.opacity="";cur.style.transform="";
      next.classList.add("active");window.scrollTo(0,0);
      setTimeout(function(){runReveal(next);},50);
    },300);
  } else {
    next.classList.add("active");window.scrollTo(0,0);
    setTimeout(function(){runReveal(next);},50);
  }
  var land=name==="landing";
  document.getElementById("mainNav").classList.toggle("visible",!land);
  document.getElementById("mainFtr").classList.toggle("visible",!land);
  closeMob();
}
function runReveal(c){
  var els=(c||document).querySelectorAll(".reveal");
  for(var i=0;i<els.length;i++){
    (function(el,idx){el.classList.remove("shown");setTimeout(function(){el.classList.add("shown");},80+idx*90);})(els[i],i);
  }
}
function toggleMenu(){document.getElementById("mobMenu").classList.toggle("open");document.getElementById("burger").classList.toggle("open");}
function closeMob(){document.getElementById("mobMenu").classList.remove("open");document.getElementById("burger").classList.remove("open");}
function toggleSub(id){document.getElementById(id).classList.toggle("open");}
window.addEventListener("scroll",function(){
  var n=document.getElementById("mainNav");
  if(n.classList.contains("visible"))n.classList.toggle("scrolled",window.scrollY>20);
});

function renderProds(list){
  var g=document.getElementById("prodGrid");
  if(!list.length){g.innerHTML="<div style='text-align:center;padding:3rem;color:var(--text3);grid-column:1/-1'>No products found.</div>";return;}
  var html="";
  for(var i=0;i<list.length;i++){
    var p=list[i];
    var soldOut=p.soldOut?true:false;
    var clickFn=soldOut?"showToast('This product is sold out')":"openProd("+p.id+")";
    html+="<div class='prod-card"+(soldOut?" sold-out":"")+"' style='animation-delay:"+(i*.07)+"s' onclick=\""+clickFn+"\">";
    html+="<div class='prod-thumb'>"+(p.img?"<img src='"+p.img+"' alt='"+p.name+"'/>":p.emoji);
    if(soldOut)html+="<div class='prod-sold-overlay'><div class='prod-sold-stamp'>Sold Out</div></div>";
    html+="<div class='prod-thumb-overlay'></div>";
    if(p.badge&&!soldOut)html+="<div class='prod-badge "+p.badge+"'>"+p.badge.toUpperCase()+"</div>";
    html+="</div><div class='prod-info'>";
    html+="<div class='prod-cat'>"+(catMap[p.cat]||p.cat)+"</div>";
    html+="<div class='prod-name'>"+p.name+"</div>";
    var rData=p.reviewData||(allReviews&&allReviews[p.id])||[];var rCount=rData.length||0;var avgR=rCount?getAvgRating(p):"";html+="<div class='prod-rating'>"+(rCount?"★"+avgR+" ("+rCount+" review"+(rCount!==1?"s":"")+")":('<span style=\'color:var(--text3);font-size:.75rem\'>No reviews yet</span>'))+"</div>";
    html+="<div><span class='prod-price'>\u20A6"+p.price.toLocaleString()+"</span>";
    if(p.oldPrice)html+="<span class='prod-price-old'>\u20A6"+p.oldPrice.toLocaleString()+"</span>";
    html+="</div><button class='view-btn'>"+(soldOut?"Sold Out":"View Product \u2192")+"</button></div></div>";
  }
  g.innerHTML=html;
}
renderProds(products);


function renderReviews(productId) {
  var box = document.getElementById('reviewsList');
  var summary = document.getElementById('reviewsSummary');
  if (!box) return;
  var revs = allReviews[productId] || [];

  if (revs.length) {
    var total = 0;
    for (var i = 0; i < revs.length; i++) total += revs[i].stars;
    var avg = (total / revs.length).toFixed(1);
    var stars = '';
    for (var i = 1; i <= 5; i++) stars += i <= Math.round(avg) ? '★' : '☆';
    if (summary) {
      summary.innerHTML = "<span class='reviews-avg'>" + avg + "</span><div><div class='reviews-avg-stars'>" + stars + "</div><div class='reviews-avg-count'>" + revs.length + " review" + (revs.length!==1?'s':'') + "</div></div>";
      summary.style.display = 'flex';
    }
  } else {
    if (summary) summary.style.display = 'none';
  }

  if (!revs.length) {
    box.innerHTML = "<div class='no-reviews'>No reviews yet. Be the first to review this product!</div>";
    return;
  }
  var html = '';
  for (var i = revs.length - 1; i >= 0; i--) {
    var r = revs[i];
    var stars = '';
    for (var j = 1; j <= 5; j++) stars += j <= r.stars ? '★' : '☆';
    html += "<div class='review-item'>";
    html += "<div class='review-meta'><span class='review-name'>" + r.name + "</span><span class='review-date'>" + r.date + "</span></div>";
    html += "<div class='review-stars'>" + stars + "</div>";
    if (r.text) html += "<div class='review-text'>" + r.text + "</div>";
    html += "</div>";
  }
  box.innerHTML = html;
}

function openProd(id) {
  var p = null;
  for (var i = 0; i < products.length; i++) { if (products[i].id === id) { p = products[i]; break; } }
  if (!p) return;
  curProd = p; selSize = null;

  // Gallery
  buildGallery(p);

  // Details
  document.getElementById('detBadge').textContent = p.badge ? p.badge.toUpperCase() : (catMap[p.cat] || p.cat);
  document.getElementById('detName').textContent = p.name;
  var ph = '₦' + p.price.toLocaleString();
  if (p.oldPrice) ph += "<span class='det-price-old'>₦" + p.oldPrice.toLocaleString() + "</span>";
  document.getElementById('detPrice').innerHTML = ph;
  var szh = '';
  for (var i = 0; i < p.sizes.length; i++) {
    szh += "<button class='sz-btn' onclick=\"pickSize(this,'" + p.sizes[i] + "')\">" + p.sizes[i] + "</button>";
  }
  document.getElementById('sizesWrap').innerHTML = szh;
  document.getElementById('detDesc').innerHTML = p.description || 'A premium quality piece from YK Collection.';
  document.getElementById('detMeta').innerHTML =
    "<div class='det-meta-row'><span class='det-meta-lbl'>Category</span><span class='det-meta-val'>" + (catMap[p.cat]||p.cat) + "</span></div>" +
    "<div class='det-meta-row'><span class='det-meta-lbl'>Color</span><span class='det-meta-val'>" + p.color + "</span></div>" +
    "<div class='det-meta-row'><span class='det-meta-lbl'>Material</span><span class='det-meta-val'>" + p.material + "</span></div>";

  // Reviews
  if (p.reviewData) allReviews[id] = p.reviewData;
  setTimeout(function(){ renderReviews(id); }, 50);

  go('product-detail');
}

function filter(cat,btn){
  var tabs=document.querySelectorAll(".cat-tab");
  for(var i=0;i<tabs.length;i++)tabs[i].classList.remove("active");
  btn.classList.add("active");
  if(cat==="all")renderProds(products);
  else{var f=[];for(var i=0;i<products.length;i++){if(products[i].cat===cat)f.push(products[i]);}renderProds(f);}
}
function filterGo(cat){
  go("shop");
  setTimeout(function(){
    var tabs=document.querySelectorAll(".cat-tab");
    for(var i=0;i<tabs.length;i++){
      var oc=tabs[i].getAttribute("onclick")||"";
      if(oc.indexOf(cat)>-1){filter(cat,tabs[i]);break;}
    }
  },350);
}

function pickSize(btn,size){
  var btns=document.querySelectorAll(".sz-btn");
  for(var i=0;i<btns.length;i++)btns[i].classList.remove("sel");
  btn.classList.add("sel");selSize=size;
}
function addFromDetail(){
  if(!selSize){showToast("Please select a size first");return;}
  var p=curProd,key=p.id+"-"+selSize;
  var ex=null;
  for(var i=0;i<cart.length;i++){if(cart[i].key===key){ex=cart[i];break;}}
  if(ex)ex.qty++;
  else cart.push({id:p.id,name:p.name,cat:p.cat,emoji:p.emoji,img:p.img,price:p.price,key:key,size:selSize,qty:1});
  updateCart();bumpCount();showToast(p.name+" ("+selSize+") added to cart!");
  setTimeout(toggleCart,400);
}
function buyNow(){
  if(!selSize){showToast("Please select a size first");return;}
  var p=curProd;
  var msg="QUICK ORDER - YK COLLECTION\n\n"+p.name+" (Size: "+selSize+")\nPrice: NGN"+p.price.toLocaleString()+"\n\nNationwide Delivery\n\nPlease confirm my order. Thank you!";
  window.open("https://wa.me/2349014223167?text="+encodeURIComponent(msg),"_blank");
}
function updateCart(){
  var total=0,count=0;
  for(var i=0;i<cart.length;i++){total+=cart[i].price*cart[i].qty;count+=cart[i].qty;}
  document.getElementById("cc1").textContent=count;
  document.getElementById("cc2").textContent=count;
  document.getElementById("cartTotal").innerHTML="\u20A6"+total.toLocaleString();
  document.getElementById("cartSubtitle").textContent=count+" item"+(count!==1?"s":"");
  var box=document.getElementById("cartItems");
  if(!cart.length){box.innerHTML="<div class='cart-empty'><div class='cart-empty-icon'>\uD83D\uDED2</div><p>Your cart is empty</p></div>";return;}
  var html="";
  for(var i=0;i<cart.length;i++){
    var it=cart[i];
    html+="<div class='ci'><div class='ci-thumb'>"+(it.img?"<img src='"+it.img+"'/>":it.emoji)+"</div>";
    html+="<div style='flex:1'><div class='ci-name'>"+it.name+"</div>";
    html+="<div class='ci-size'>Size: "+it.size+"</div>";
    html+="<div class='ci-price'>\u20A6"+(it.price*it.qty).toLocaleString()+"</div>";
    html+="<div class='ci-qty'>";
    html+="<button class='qty-btn' onclick=\"chQty('"+it.key+"',-1)\">\u2212</button>";
    html+="<span class='qty-num'>"+it.qty+"</span>";
    html+="<button class='qty-btn' onclick=\"chQty('"+it.key+"',1)\">+</button>";
    html+="</div><button class='rm-btn' onclick=\"rmItem('"+it.key+"')\">Remove</button></div></div>";
  }
  box.innerHTML=html;
}
function rmItem(key){var n=[];for(var i=0;i<cart.length;i++){if(cart[i].key!==key)n.push(cart[i]);}cart=n;updateCart();}
function chQty(key,d){for(var i=0;i<cart.length;i++){if(cart[i].key===key){cart[i].qty+=d;if(cart[i].qty<=0)rmItem(key);else updateCart();return;}}}
function toggleCart(){
  document.getElementById("cartPanel").classList.toggle("open");
  document.getElementById("cartOverlay").classList.toggle("open");
  document.body.style.overflow=document.getElementById("cartPanel").classList.contains("open")?"hidden":"";
}
function bumpCount(){var c=document.getElementById("cc1");c.classList.add("bump");setTimeout(function(){c.classList.remove("bump");},400);}
function checkout(){
  if(!cart.length){showToast("Your cart is empty!");return;}
  var total=0;for(var i=0;i<cart.length;i++)total+=cart[i].price*cart[i].qty;
  var msg="NEW ORDER - YK COLLECTION\n\nItems Ordered:\n";
  for(var i=0;i<cart.length;i++){var it=cart[i];msg+=it.name+" (Size: "+it.size+") x"+it.qty+" - NGN"+(it.price*it.qty).toLocaleString()+"\n";}
  msg+="\nTotal: NGN"+total.toLocaleString()+"\nNationwide Delivery\n\nPlease confirm my order. Thank you!";
  window.open("https://wa.me/2349014223167?text="+encodeURIComponent(msg),"_blank");
}
function submitForm(){
  if(!document.getElementById("fn").value.trim()||!document.getElementById("em").value.trim()||!document.getElementById("ms").value.trim()){showToast("Please fill all fields");return;}
  document.getElementById("cfWrap").style.display="none";document.getElementById("fOk").style.display="block";
}
function showToast(msg){var t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");setTimeout(function(){t.classList.remove("show");},3200);}
;

var ADMIN_PASS="Chibuzor12.";
var adminLoggedIn=false;
var editingId=null;
var complaints=[];
var activeCompType='complaint';

function openAdmin(){
  if(adminLoggedIn){go('admin');renderAdminProducts();renderAdminComplaints();}
  else{
    document.getElementById('adminOverlay').classList.add('open');
    document.getElementById('adminPassInput').value='';
    document.getElementById('adminPassErr').style.display='none';
    setTimeout(function(){document.getElementById('adminPassInput').focus();},100);
  }
}
function closeAdminLogin(){document.getElementById('adminOverlay').classList.remove('open');}
function submitAdminPass(){
  var val=document.getElementById('adminPassInput').value;
  if(val===ADMIN_PASS){
    adminLoggedIn=true;
    document.getElementById('adminOverlay').classList.remove('open');
    go('admin');renderAdminProducts();renderAdminComplaints();
  } else {
    document.getElementById('adminPassErr').style.display='block';
    document.getElementById('adminPassInput').value='';
    document.getElementById('adminPassInput').focus();
  }
}
function logoutAdmin(){adminLoggedIn=false;go('shop');showToast('Logged out of admin');}
document.addEventListener('keydown',function(e){
  if(e.key==='Enter'&&document.getElementById('adminOverlay').classList.contains('open'))submitAdminPass();
});
function toggleSoldOut(id){
  for(var i=0;i<products.length;i++){if(products[i].id===id){products[i].soldOut=!products[i].soldOut;break;}}
  renderAdminProducts();renderProds(products);showToast('Product updated!');
}
function renderAdminProducts(){
  var g=document.getElementById('adminProdList');
  if(!products.length){g.innerHTML="<div class='admin-empty'>No products yet.</div>";return;}
  var html='';
  for(var i=0;i<products.length;i++){
    var p=products[i];
    html+="<div class='admin-prod-row'>";
    html+="<div class='admin-prod-thumb'>"+(p.img?"<img src='"+p.img+"'/>":p.emoji)+"</div>";
    html+="<div class='admin-prod-info'><div class='admin-prod-name'>"+p.name+(p.soldOut?" <span style='color:var(--red);font-size:.72rem'>[SOLD OUT]</span>":"")+"</div>";
    html+="<div class='admin-prod-meta'>\u20A6"+p.price.toLocaleString()+" &bull; "+(catMap[p.cat]||p.cat)+(p.badge?" &bull; <span class='admin-badge-tag'>"+p.badge.toUpperCase()+"</span>":"")+"</div></div>";
    html+="<div style='display:flex;gap:.4rem;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end'>";
    html+="<button class='admin-edit-btn' onclick='openEditModal("+p.id+")'>&#9998; Edit</button>";
    html+="<button class='admin-edit-btn' style='background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.25);color:var(--red)' onclick='toggleSoldOut("+p.id+")'>"+(p.soldOut?"\u2705 In Stock":"\uD83D\uDEAB Sold Out")+"</button>";
    html+="<button class='admin-del-btn' onclick='deleteProduct("+p.id+")'>&#128465;</button>";
    html+="</div></div>";
  }
  g.innerHTML=html;
}
function deleteProduct(id){
  if(!confirm('Delete this product?'))return;
  var n=[];for(var i=0;i<products.length;i++){if(products[i].id!==id)n.push(products[i]);}
  products=n;renderAdminProducts();renderProds(products);showToast('Product deleted!');
}
function openEditModal(id){
  var p=null;for(var i=0;i<products.length;i++){if(products[i].id===id){p=products[i];break;}}
  if(!p)return;editingId=id;
  document.getElementById('eName').value=p.name;
  document.getElementById('eCat').value=p.cat;
  document.getElementById('ePrice').value=p.price;
  document.getElementById('eOldPrice').value=p.oldPrice||'';
  document.getElementById('eBadge').value=p.badge||'';
  document.getElementById('eSizes').value=p.sizes.join(', ');
  document.getElementById('eColor').value=p.color||'';
  document.getElementById('eMaterial').value=p.material||'';
  document.getElementById('eEmoji').value=p.emoji||'';
  document.getElementById('eImgUrl').value=p.img||'';
  document.getElementById('eDesc').value=p.description||'';
  document.getElementById('editModalOverlay').classList.add('open');
}
function closeEditModal(){document.getElementById('editModalOverlay').classList.remove('open');editingId=null;}
function saveEditProduct(){
  if(editingId===null)return;
  var name=document.getElementById('eName').value.trim();
  var price=parseInt(document.getElementById('ePrice').value);
  var sizesRaw=document.getElementById('eSizes').value.trim();
  if(!name){showToast('Please enter a product name');return;}
  if(!price||isNaN(price)){showToast('Please enter a valid price');return;}
  if(!sizesRaw){showToast('Please enter at least one size');return;}
  for(var i=0;i<products.length;i++){
    if(products[i].id===editingId){
      products[i].name=name;
      products[i].cat=document.getElementById('eCat').value;
      products[i].price=price;
      products[i].oldPrice=document.getElementById('eOldPrice').value?parseInt(document.getElementById('eOldPrice').value):null;
      products[i].badge=document.getElementById('eBadge').value||null;
      products[i].sizes=sizesRaw.split(',').map(function(s){return s.trim();}).filter(Boolean);
      products[i].color=document.getElementById('eColor').value.trim()||'N/A';
      products[i].material=document.getElementById('eMaterial').value.trim()||'N/A';
      products[i].emoji=document.getElementById('eEmoji').value.trim()||products[i].emoji;
      products[i].img=document.getElementById('eImgUrl').value.trim()||null;
      products[i].description=document.getElementById('eDesc').value.trim();
      break;
    }
  }
  saveProductsToStorage();
  closeEditModal();renderAdminProducts();renderProds(products);showToast(name+' updated! Saving...');
}
function addAdminProduct(){
  var name=document.getElementById('aName').value.trim();
  var cat=document.getElementById('aCat').value;
  var price=parseInt(document.getElementById('aPrice').value);
  var oldPriceVal=document.getElementById('aOldPrice').value.trim();
  var badge=document.getElementById('aBadge').value;
  var sizesRaw=document.getElementById('aSizes').value.trim();
  var color=document.getElementById('aColor').value.trim()||'N/A';
  var material=document.getElementById('aMaterial').value.trim()||'N/A';
  var emoji=document.getElementById('aEmoji').value.trim()||'\uD83D\uDC55';
  var imgUrl=document.getElementById('aImgUrl').value.trim();
  var galleryRaw=document.getElementById('aImgGallery').value.trim();
  var extraImgs=galleryRaw?galleryRaw.split('\n').map(function(u){return u.trim();}).filter(Boolean):[];
  var desc=document.getElementById('aDesc').value.trim();
  if(!name){showToast('Please enter a product name');return;}
  if(!price||isNaN(price)){showToast('Please enter a valid price');return;}
  if(!sizesRaw){showToast('Please enter at least one size');return;}
  var sizes=sizesRaw.split(',').map(function(s){return s.trim();}).filter(Boolean);
  var maxId=0;for(var i=0;i<products.length;i++){if(products[i].id>maxId)maxId=products[i].id;}
  products.push({id:maxId+1,name:name,cat:cat,emoji:emoji,img:imgUrl||null,images:extraImgs,price:price,oldPrice:oldPriceVal?parseInt(oldPriceVal):null,badge:badge||null,rating:"\u2605\u2605\u2605\u2605\u2605",reviews:0,sizes:sizes,soldOut:false,color:color,material:material,description:desc||'A premium quality piece from YK Collection.'});
  saveProductsToStorage();
  renderAdminProducts();renderProds(products);clearAdminForm();showToast(name+' added! Saving...');
}
function clearAdminForm(){
  ['aName','aPrice','aOldPrice','aSizes','aColor','aMaterial','aEmoji','aImgUrl','aDesc'].forEach(function(id){document.getElementById(id).value='';});
  document.getElementById('aCat').value='clothing-male';
  document.getElementById('aBadge').value='';
}
function setCompType(type,btn){
  activeCompType=type;
  var tabs=document.querySelectorAll('.comp-tab');
  for(var i=0;i<tabs.length;i++)tabs[i].classList.remove('active');
  btn.classList.add('active');
}
function submitComplaint(){
  var name=document.getElementById('compName').value.trim();
  var msg=document.getElementById('compMsg').value.trim();
  if(!name){showToast('Please enter your name');return;}
  if(!msg){showToast('Please enter your message');return;}
  var now=new Date();
  var dateStr=now.toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  complaints.push({id:Date.now(),type:activeCompType,name:name,msg:msg,date:dateStr});
  document.getElementById('compFormWrap').style.display='none';
  document.getElementById('compOk').style.display='block';
}
function resetCompForm(){
  document.getElementById('compName').value='';document.getElementById('compMsg').value='';
  document.getElementById('compFormWrap').style.display='block';document.getElementById('compOk').style.display='none';
}
function renderAdminComplaints(){
  var box=document.getElementById('adminCompList');
  if(!complaints.length){box.innerHTML="<div class='admin-no-comp'>No messages yet from customers.</div>";return;}
  var html='';
  for(var i=complaints.length-1;i>=0;i--){
    var c=complaints[i];
    html+="<div class='admin-comp-item'>";
    html+="<div class='admin-comp-hdr'><div style='display:flex;align-items:center;gap:.6rem'>";
    html+="<span class='admin-comp-type "+c.type+"'>"+c.type.toUpperCase()+"</span>";
    html+="<span class='admin-comp-name'>"+c.name+"</span></div>";
    html+="<span class='admin-comp-date'>"+c.date+"</span></div>";
    html+="<div class='admin-comp-msg'>"+c.msg+"</div>";
    html+="<button class='admin-comp-del' onclick='deleteComplaint("+c.id+")'>&#128465; Delete</button></div>";
  }
  box.innerHTML=html;
}
function deleteComplaint(id){
  complaints=complaints.filter(function(c){return c.id!==id;});renderAdminComplaints();
}
var adminTapCount=0,adminTapTimer=null;
function handleAdminTrigger(){
  adminTapCount++;
  if(adminTapTimer)clearTimeout(adminTapTimer);
  adminTapTimer=setTimeout(function(){adminTapCount=0;},1500);
  if(adminTapCount>=5){adminTapCount=0;openAdmin();}
}
var currentCat='all';
function handleSearch(){
  var q=document.getElementById('searchBox').value.trim().toLowerCase();
  document.getElementById('searchClear').style.display=q?'block':'none';
  var base=currentCat==='all'?products:products.filter(function(p){return p.cat===currentCat;});
  if(!q){renderProds(base);return;}
  renderProds(base.filter(function(p){
    return p.name.toLowerCase().indexOf(q)>-1||(catMap[p.cat]||'').toLowerCase().indexOf(q)>-1||(p.color||'').toLowerCase().indexOf(q)>-1||(p.material||'').toLowerCase().indexOf(q)>-1;
  }));
}
function clearSearch(){
  document.getElementById('searchBox').value='';document.getElementById('searchClear').style.display='none';
  renderProds(currentCat==='all'?products:products.filter(function(p){return p.cat===currentCat;}));
}
var _origFilter=filter;
filter=function(cat,btn){
  currentCat=cat;
  document.getElementById('searchBox').value='';document.getElementById('searchClear').style.display='none';
  _origFilter(cat,btn);
};
function joinWhatsApp(){
  var msg="Hello YK Collection! I would like to join your WhatsApp list to get updates on new arrivals and special offers.";
  window.open("https://wa.me/2349014223167?text="+encodeURIComponent(msg),"_blank");
}
function closeRamadan(){var b=document.getElementById('ramadanBanner');if(b)b.style.display='none';}

/* ── PARTICLE SYSTEM ── */
(function(){
  var canvas = document.getElementById('particleCanvas');
  if(!canvas) return;
  var ctx = canvas.getContext('2d');
  var particles = [];
  var W, H;

  function resize(){
    W = canvas.width = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  var colors = ['#38bdf8','#7dd3fc','#bae6fd','#0ea5e9','#ffffff','#e0f2fe'];

  function Particle(){
    this.reset();
  }
  Particle.prototype.reset = function(){
    this.x = Math.random() * W;
    this.y = Math.random() * H + H;
    this.r = Math.random() * 3 + 1;
    this.color = colors[Math.floor(Math.random() * colors.length)];
    this.speedY = -(Math.random() * 1.5 + 0.5);
    this.speedX = (Math.random() - 0.5) * 0.8;
    this.opacity = Math.random() * 0.6 + 0.2;
    this.wobble = Math.random() * Math.PI * 2;
    this.wobbleSpeed = Math.random() * 0.03 + 0.01;
    this.shape = Math.random() > 0.5 ? 'circle' : 'square';
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.05;
  };
  Particle.prototype.update = function(){
    this.wobble += this.wobbleSpeed;
    this.x += this.speedX + Math.sin(this.wobble) * 0.5;
    this.y += this.speedY;
    this.rotation += this.rotSpeed;
    if(this.y < -20) this.reset();
  };
  Particle.prototype.draw = function(){
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.fillStyle = this.color;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    if(this.shape === 'circle'){
      ctx.beginPath();
      ctx.arc(0, 0, this.r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-this.r, -this.r, this.r * 2, this.r * 2);
    }
    ctx.restore();
  };

  for(var i = 0; i < 80; i++){
    var p = new Particle();
    p.y = Math.random() * H;
    particles.push(p);
  }

  function animate(){
    var landing = document.getElementById('landing');
    if(!landing || !landing.classList.contains('active')){
      requestAnimationFrame(animate);
      return;
    }
    ctx.clearRect(0, 0, W, H);
    for(var i = 0; i < particles.length; i++){
      particles[i].update();
      particles[i].draw();
    }
    requestAnimationFrame(animate);
  }
  animate();
})();

/* ── BROWSER STORAGE (localStorage) ── */
var STORAGE_KEY = 'yk_products_v1';
var STORAGE_CART = 'yk_cart_v1';

function saveProductsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  } catch(e) {}
}

function loadProductsFromStorage() {
  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      var parsed = JSON.parse(saved);
      if (parsed && parsed.length) {
        products = parsed;
        return true;
      }
    }
  } catch(e) {}
  return false;
}

function saveCartToStorage() {
  try {
    localStorage.setItem(STORAGE_CART, JSON.stringify(cart));
  } catch(e) {}
}

function loadCartFromStorage() {
  try {
    var saved = localStorage.getItem(STORAGE_CART);
    if (saved) {
      var parsed = JSON.parse(saved);
      if (parsed && parsed.length) {
        cart = parsed;
        updateCart();
      }
    }
  } catch(e) {}
}

/* Override product-modifying functions to auto-save */
var _origDeleteProduct = deleteProduct;
deleteProduct = function(id) {
  if (!confirm('Delete this product?')) return;
  var n = [];
  for (var i = 0; i < products.length; i++) {
    if (products[i].id !== id) n.push(products[i]);
  }
  products = n;
  saveProductsToStorage();
  renderAdminProducts();
  renderProds(products);
  showToast('Product deleted!');
};

var _origToggleSoldOut = toggleSoldOut;
toggleSoldOut = function(id) {
  for (var i = 0; i < products.length; i++) {
    if (products[i].id === id) {
      products[i].soldOut = !products[i].soldOut;
      break;
    }
  }
  saveProductsToStorage();
  renderAdminProducts();
  renderProds(products);
  showToast('Product updated!');
};

var _origSaveEdit = saveEditProduct;
saveEditProduct = function() {
  if (editingId === null) return;
  var name = document.getElementById('eName').value.trim();
  var price = parseInt(document.getElementById('ePrice').value);
  var sizesRaw = document.getElementById('eSizes').value.trim();
  if (!name) { showToast('Please enter a product name'); return; }
  if (!price || isNaN(price)) { showToast('Please enter a valid price'); return; }
  if (!sizesRaw) { showToast('Please enter at least one size'); return; }
  for (var i = 0; i < products.length; i++) {
    if (products[i].id === editingId) {
      products[i].name = name;
      products[i].cat = document.getElementById('eCat').value;
      products[i].price = price;
      products[i].oldPrice = document.getElementById('eOldPrice').value ? parseInt(document.getElementById('eOldPrice').value) : null;
      products[i].badge = document.getElementById('eBadge').value || null;
      products[i].sizes = sizesRaw.split(',').map(function(s){return s.trim();}).filter(Boolean);
      products[i].color = document.getElementById('eColor').value.trim() || 'N/A';
      products[i].material = document.getElementById('eMaterial').value.trim() || 'N/A';
      products[i].emoji = document.getElementById('eEmoji').value.trim() || products[i].emoji;
      products[i].img = document.getElementById('eImgUrl').value.trim() || null;
      products[i].description = document.getElementById('eDesc').value.trim();
      break;
    }
  }
  saveProductsToStorage();
  closeEditModal();
  renderAdminProducts();
  renderProds(products);
  showToast(name + ' updated!');
};

var _origAddProduct = addAdminProduct;
addAdminProduct = function() {
  var name = document.getElementById('aName').value.trim();
  var cat = document.getElementById('aCat').value;
  var price = parseInt(document.getElementById('aPrice').value);
  var oldPriceVal = document.getElementById('aOldPrice').value.trim();
  var badge = document.getElementById('aBadge').value;
  var sizesRaw = document.getElementById('aSizes').value.trim();
  var color = document.getElementById('aColor').value.trim() || 'N/A';
  var material = document.getElementById('aMaterial').value.trim() || 'N/A';
  var emoji = document.getElementById('aEmoji').value.trim() || '\uD83D\uDC55';
  var imgUrl = document.getElementById('aImgUrl').value.trim();
  var desc = document.getElementById('aDesc').value.trim();
  if (!name) { showToast('Please enter a product name'); return; }
  if (!price || isNaN(price)) { showToast('Please enter a valid price'); return; }
  if (!sizesRaw) { showToast('Please enter at least one size'); return; }
  var sizes = sizesRaw.split(',').map(function(s){return s.trim();}).filter(Boolean);
  var maxId = 0;
  for (var i = 0; i < products.length; i++) { if (products[i].id > maxId) maxId = products[i].id; }
  products.push({
    id: maxId+1, name: name, cat: cat, emoji: emoji,
    img: imgUrl || null, price: price,
    oldPrice: oldPriceVal ? parseInt(oldPriceVal) : null,
    badge: badge || null, rating: "\u2605\u2605\u2605\u2605\u2605",
    reviews: 0, sizes: sizes, soldOut: false,
    color: color, material: material,
    description: desc || 'A premium quality piece from YK Collection.'
  });
  saveProductsToStorage();
  renderAdminProducts();
  renderProds(products);
  clearAdminForm();
  showToast(name + ' added! \uD83C\uDF89');
};

/* Override cart functions to auto-save */
var _origAddFromDetail = addFromDetail;
addFromDetail = function() {
  if (!selSize) { showToast("Please select a size first"); return; }
  var p = curProd, key = p.id + "-" + selSize;
  var ex = null;
  for (var i = 0; i < cart.length; i++) { if (cart[i].key === key) { ex = cart[i]; break; } }
  if (ex) ex.qty++;
  else cart.push({id:p.id,name:p.name,cat:p.cat,emoji:p.emoji,img:p.img,price:p.price,key:key,size:selSize,qty:1});
  saveCartToStorage();
  updateCart(); bumpCount();
  showToast(p.name + " (" + selSize + ") added to cart!");
  setTimeout(toggleCart, 400);
};

var _origRmItem = rmItem;
rmItem = function(key) {
  var n = [];
  for (var i = 0; i < cart.length; i++) { if (cart[i].key !== key) n.push(cart[i]); }
  cart = n;
  saveCartToStorage();
  updateCart();
};

var _origChQty = chQty;
chQty = function(key, d) {
  for (var i = 0; i < cart.length; i++) {
    if (cart[i].key === key) {
      cart[i].qty += d;
      if (cart[i].qty <= 0) rmItem(key);
      else { saveCartToStorage(); updateCart(); }
      return;
    }
  }
};

/* Admin reset storage button */
function resetStorageProducts() {
  if (!confirm('This will reset ALL products back to the original 8 default products. Are you sure?')) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

/* Init — load from storage on page load */
(function(){
  var loaded = loadProductsFromStorage();
  if (loaded) {
    renderProds(products);
  }
  loadCartFromStorage();
})();

/* Image preview in admin */
function previewImg(inputId, previewId) {
  var val = document.getElementById(inputId).value.trim();
  var prev = document.getElementById(previewId);
  if (!prev) return;
  if (val) {
    prev.innerHTML = "<img src='" + val + "' onerror=\"this.parentNode.innerHTML='<span style=\\'color:var(--text3);font-size:.75rem\\'>Image not found</span>'\" style='width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--border);margin-top:.4rem'/>";
  } else {
    prev.innerHTML = '';
  }
}

/* ── PRODUCT GALLERY & LIGHTBOX ── */
var galleryIndex = 0;
var galleryImages = [];
var lightboxZoom = 1;
var lightboxDragging = false;
var lightboxDragStart = {x:0, y:0};
var lightboxOffset = {x:0, y:0};
var lightboxPinchDist = 0;
var galleryTouchStartX = 0;
var galleryTouchStartY = 0;

function buildGallery(p) {
  // Build images array from product
  var imgs = [];
  if (p.images && p.images.length) {
    imgs = p.images;
  } else if (p.img) {
    imgs = [p.img];
  }
  galleryImages = imgs;
  galleryIndex = 0;

  var wrap = document.getElementById('detGallery');
  if (!wrap) return;

  var hasMultiple = imgs.length > 1;

  // Build slides
  var slidesHtml = '';
  for (var i = 0; i < imgs.length; i++) {
    var isUrl = imgs[i] && typeof imgs[i] === 'string' && (imgs[i].indexOf('http') === 0 || imgs[i].indexOf('images/') === 0 || imgs[i].indexOf('data:') === 0);
    slidesHtml += "<div class='det-gallery-slide'>" + (isUrl ? "<img src='" + imgs[i] + "' alt='Product photo " + (i+1) + "'/>" : "<span>" + imgs[i] + "</span>") + "</div>";
  }

  // No images - show emoji
  if (!imgs.length) {
    slidesHtml = "<div class='det-gallery-slide'><span>" + p.emoji + "</span></div>";
    imgs = [p.emoji];
    galleryImages = imgs;
  }

  var countHtml = imgs.length > 1 ? "<div class='gallery-count'>" + "1 / " + imgs.length + "</div>" : '';
  var arrowsHtml = imgs.length > 1 ?
    "<button class='gallery-arrow prev' onclick='galleryPrev()'>&#8592;</button>" +
    "<button class='gallery-arrow next' onclick='galleryNext()'>&#8594;</button>" : '';

  var dotsHtml = '';
  if (imgs.length > 1 && imgs.length <= 8) {
    dotsHtml = "<div class='gallery-dots'>";
    for (var i = 0; i < imgs.length; i++) {
      dotsHtml += "<button class='gallery-dot" + (i===0?" active":"") + "' onclick='galleryGoTo(" + i + ")'></button>";
    }
    dotsHtml += "</div>";
  }

  wrap.innerHTML =
    "<div class='det-gallery-main' onclick='openLightbox(galleryIndex)' id='galleryMain'>" +
    "<div class='det-gallery-slides' id='gallerySlides'>" + slidesHtml + "</div>" +
    arrowsHtml + countHtml +
    "</div>" + dotsHtml;

  // Touch swipe support
  var mainEl = document.getElementById('galleryMain');
  if (mainEl) {
    mainEl.addEventListener('touchstart', function(e) {
      galleryTouchStartX = e.touches[0].clientX;
      galleryTouchStartY = e.touches[0].clientY;
    }, {passive:true});
    mainEl.addEventListener('touchend', function(e) {
      var dx = e.changedTouches[0].clientX - galleryTouchStartX;
      var dy = e.changedTouches[0].clientY - galleryTouchStartY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
        if (dx < 0) galleryNext();
        else galleryPrev();
      } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        openLightbox(galleryIndex);
      }
    }, {passive:true});
  }
}

function galleryGoTo(idx) {
  if (!galleryImages.length) return;
  galleryIndex = Math.max(0, Math.min(idx, galleryImages.length - 1));
  var slides = document.getElementById('gallerySlides');
  if (slides) slides.style.transform = 'translateX(-' + (galleryIndex * 100) + '%)';
  // Update dots
  var dots = document.querySelectorAll('.gallery-dot');
  for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('active', i === galleryIndex);
  // Update count
  var count = document.querySelector('.gallery-count');
  if (count) count.textContent = (galleryIndex + 1) + ' / ' + galleryImages.length;
}

function galleryNext() {
  galleryGoTo((galleryIndex + 1) % galleryImages.length);
}
function galleryPrev() {
  galleryGoTo((galleryIndex - 1 + galleryImages.length) % galleryImages.length);
}

/* ── LIGHTBOX ── */
function openLightbox(idx) {
  var lb = document.getElementById('lightbox');
  if (!lb || !galleryImages.length) return;
  lightboxZoom = 1;
  lightboxOffset = {x:0, y:0};
  var img = renderLightboxImg(idx);
  document.getElementById('lbImg').innerHTML = img;
  updateLightboxThumbs(idx);
  updateLightboxCounter(idx);
  // Build thumbs
  var thumbsEl = document.getElementById('lbThumbs');
  if (thumbsEl) {
    var th = '';
    for (var i = 0; i < galleryImages.length; i++) {
      var src = galleryImages[i];
      var isUrl = src && (src.indexOf('http')===0||src.indexOf('images/')===0||src.indexOf('data:')===0);
      th += "<div class='lightbox-thumb" + (i===idx?" active":"") + "' onclick='lbGoTo(" + i + ")'>" + (isUrl?"<img src='"+src+"'/>":"<span>"+src+"</span>") + "</div>";
    }
    thumbsEl.innerHTML = galleryImages.length > 1 ? th : '';
  }
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Show zoom hint
  var hint = document.getElementById('lbZoomHint');
  if (hint) { hint.style.display = 'block'; hint.style.animation = 'fadeOut 3s forwards'; }

  // Bind pinch zoom
  setupPinchZoom();
}

function closeLightbox() {
  var lb = document.getElementById('lightbox');
  if (lb) lb.classList.remove('open');
  document.body.style.overflow = '';
  lightboxZoom = 1;
  lightboxOffset = {x:0, y:0};
}

function renderLightboxImg(idx) {
  var src = galleryImages[idx];
  var isUrl = src && typeof src === 'string' && (src.indexOf('http') === 0 || src.indexOf('images/') === 0 || src.indexOf('data:') === 0);
  if (isUrl) {
    return "<img src='" + src + "' style='max-width:95vw;max-height:80vh;object-fit:contain;border-radius:8px;cursor:grab' draggable='false'/>";
  }
  return "<span style='font-size:8rem'>" + src + "</span>";
}

function lbGoTo(idx) {
  idx = Math.max(0, Math.min(idx, galleryImages.length - 1));
  galleryIndex = idx;
  document.getElementById('lbImg').innerHTML = renderLightboxImg(idx);
  applyLightboxTransform();
  updateLightboxThumbs(idx);
  updateLightboxCounter(idx);
  setupPinchZoom();
}
function lbNext() { lbGoTo((galleryIndex + 1) % galleryImages.length); }
function lbPrev() { lbGoTo((galleryIndex - 1 + galleryImages.length) % galleryImages.length); }

function updateLightboxThumbs(idx) {
  var thumbs = document.querySelectorAll('.lightbox-thumb');
  for (var i = 0; i < thumbs.length; i++) thumbs[i].classList.toggle('active', i === idx);
}
function updateLightboxCounter(idx) {
  var c = document.getElementById('lbCounter');
  if (c) c.textContent = (idx + 1) + ' of ' + galleryImages.length;
}

function applyLightboxTransform() {
  var img = document.querySelector('#lbImg img');
  if (img) img.style.transform = 'scale(' + lightboxZoom + ') translate(' + lightboxOffset.x + 'px,' + lightboxOffset.y + 'px)';
}

function setupPinchZoom() {
  var wrap = document.getElementById('lbImgWrap');
  if (!wrap) return;

  // Mouse wheel zoom
  wrap.onwheel = function(e) {
    e.preventDefault();
    lightboxZoom = Math.max(1, Math.min(4, lightboxZoom + (e.deltaY < 0 ? 0.2 : -0.2)));
    if (lightboxZoom === 1) lightboxOffset = {x:0, y:0};
    applyLightboxTransform();
  };

  // Touch pinch zoom
  wrap.ontouchstart = function(e) {
    if (e.touches.length === 2) {
      lightboxPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    } else if (e.touches.length === 1) {
      lightboxDragging = true;
      lightboxDragStart = {x: e.touches[0].clientX - lightboxOffset.x, y: e.touches[0].clientY - lightboxOffset.y};
    }
  };
  wrap.ontouchmove = function(e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      var dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lightboxZoom = Math.max(1, Math.min(4, lightboxZoom * (dist / lightboxPinchDist)));
      lightboxPinchDist = dist;
      if (lightboxZoom === 1) lightboxOffset = {x:0, y:0};
      applyLightboxTransform();
    } else if (e.touches.length === 1 && lightboxZoom > 1) {
      lightboxOffset = {
        x: e.touches[0].clientX - lightboxDragStart.x,
        y: e.touches[0].clientY - lightboxDragStart.y
      };
      applyLightboxTransform();
    }
  };
  wrap.ontouchend = function(e) {
    lightboxDragging = false;
    if (lightboxZoom <= 1) {
      lightboxZoom = 1;
      lightboxOffset = {x:0, y:0};
    }
  };
}

// Keyboard support for lightbox
document.addEventListener('keydown', function(e) {
  var lb = document.getElementById('lightbox');
  if (!lb || !lb.classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowRight') lbNext();
  if (e.key === 'ArrowLeft') lbPrev();
});

;

/* ── FLOATING WHATSAPP ── */
function initWaFloat() {
  var btn = document.getElementById('waFloat');
  if (!btn) return;
  window.addEventListener('scroll', function() {
    var landing = document.getElementById('landing');
    if (landing && landing.classList.contains('active')) {
      btn.classList.remove('visible');
    } else {
      btn.classList.add('visible');
    }
  });
  // Also show/hide on page change - patch go()
  var _origGo = go;
  go = function(name) {
    _origGo(name);
    setTimeout(function() {
      if (btn) btn.classList.toggle('visible', name !== 'landing');
    }, 350);
  };
}
document.addEventListener('DOMContentLoaded', function(){ initWaFloat(); });
setTimeout(initWaFloat, 500);

/* ── META TAGS + FAVICON added via JS ── */
(function(){
  // Meta description
  var meta = document.createElement('meta');
  meta.name = 'description';
  meta.content = 'YK Collection - Premium fashion for men and women. Shop quality clothing, shoes, bags and accessories. Nationwide delivery across Nigeria. Order via WhatsApp.';
  document.head.appendChild(meta);
  // OG tags
  var tags = [
    {property:'og:title', content:'YK Collection - Premium Fashion Store'},
    {property:'og:description', content:'Shop premium clothing, shoes and accessories for men and women. Nationwide delivery. Order via WhatsApp.'},
    {property:'og:type', content:'website'},
    {name:'twitter:card', content:'summary_large_image'}
  ];
  tags.forEach(function(t) {
    var m = document.createElement('meta');
    if (t.property) m.setAttribute('property', t.property);
    if (t.name) m.setAttribute('name', t.name);
    m.content = t.content;
    document.head.appendChild(m);
  });
  // Favicon - YK emoji favicon
  var link = document.createElement('link');
  link.rel = 'icon';
  link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%2338bdf8"/><text y=".9em" font-size="65" font-family="serif" font-weight="900" x="50%" text-anchor="middle" fill="white">YK</text></svg>';
  document.head.appendChild(link);
})();


/* ── SHOP CATEGORY SYSTEM ── */
var shopCategories = {
  unisex: [
    {id:'jerseys', label:'Jerseys'}
  ],
  men: [
    {id:'clothing-male', label:'Clothing'},
    {id:'shoes-male', label:'Shoes'},
    {id:'bags-male', label:'Bags'},
    {id:'watches-male', label:'Watches & Accessories'}
  ],
  women: [
    {id:'clothing-female', label:'Clothing'},
    {id:'shoes-female', label:'Shoes'},
    {id:'bags-female', label:'Bags'},
    {id:'watches-female', label:'Watches'},
    {id:'jewelry-female', label:'Jewelry & Accessories'}
  ]
};

var comingSoonCats = {'jewelry-female': true};
var comingSoonSpecial = {newArrivals: false, sale: false};
var activeFilterCat = 'all';
var activeFilterSpecial = 'all';

function buildShopFilterBar() {
  var bar = document.getElementById('shopFilterBar');
  if (!bar) return;

  function makeUnisexBtns() {
    var html = '';
    for (var i = 0; i < shopCategories.unisex.length; i++) {
      var cat = shopCategories.unisex[i];
      var soon = comingSoonCats[cat.id] ? true : false;
      var cls = 'filter-tab' + (activeFilterCat === cat.id ? ' active' : '');
      if (soon) {
        html += '<button class="' + cls + '" style="opacity:.55;cursor:default">' + cat.label + '<span class="tab-soon">Soon</span></button>';
      } else {
        html += '<button class="' + cls + '" data-special="unisex-' + cat.id + '">' + cat.label + '</button>';
      }
    }
    return html;
  }
  var naSoon = comingSoonSpecial.newArrivals;
  var saleSoon = comingSoonSpecial.sale;

  bar.innerHTML =
    '<div class="shop-filter-inner" id="shopFilterInner">' +
    '<button class="filter-tab' + (activeFilterSpecial==='all'?' active':'') + '" data-special="all">All</button>' +
    '<button class="filter-tab' + (activeFilterSpecial==='new'?' active':'') + '" data-special="new">New Arrivals' + (naSoon ? '<span class="tab-soon">Soon</span>' : '') + '</button>' +
    '<button class="filter-tab' + (activeFilterSpecial==='sale'?' active':'') + '" data-special="sale">Sale / Deals' + (saleSoon ? '<span class="tab-soon">Soon</span>' : '') + '</button>' + makeUnisexBtns() +
    '</div>' +
    '<div class="active-filter-strip" id="activeFilterStrip"></div>';

  var inner = document.getElementById('shopFilterInner');
  if (inner) {
    inner.addEventListener('click', function(ev) {
      var btn = ev.target.closest('[data-special]');
      if (!btn) return;
      var sp = btn.getAttribute('data-special');
      if (sp !== null) filterSpecial(sp);
    });
  }
}

function toggleDropdown(id) {
  var dd = document.getElementById(id);
  if (!dd) return;
  var isOpen = dd.classList.contains('open');
  // Close all
  document.querySelectorAll('.filter-dropdown').forEach(function(el){ el.classList.remove('open'); });
  if (!isOpen) dd.classList.add('open');
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.filter-dropdown')) {
    document.querySelectorAll('.filter-dropdown').forEach(function(el){ el.classList.remove('open'); });
  }
});

function filterByCat(cat) {
  activeFilterCat = cat;
  activeFilterSpecial = 'all';
  document.querySelectorAll('.filter-dropdown').forEach(function(el){ el.classList.remove('open'); });
  var list = products.filter(function(p){ return p.cat === cat; });
  renderProds(list);
  updateActiveFilterStrip(catMap[cat] || cat, 'cat');
  buildShopFilterBar();
}

function filterSpecial(type) {
  activeFilterSpecial = type;
  activeFilterCat = 'all';
  document.querySelectorAll('.filter-dropdown').forEach(function(el){ el.classList.remove('open'); });
  // Handle unisex categories
  if (type.indexOf('unisex-') === 0) {
    var catId = type.replace('unisex-', '');
    activeFilterCat = catId;
    activeFilterSpecial = type;
    var uList = products.filter(function(p){ return p.cat === catId; });
    renderProds(uList);
    updateActiveFilterStrip(catMap[catId] || catId, 'special');
    buildShopFilterBar();
    clearActiveFilterStrip();
    return;
  }
  var list;
  if (type === 'all') {
    list = products;
    clearActiveFilterStrip();
  } else if (type === 'new') {
    if (comingSoonSpecial.newArrivals) { showToast('New Arrivals coming soon!'); return; }
    list = products.filter(function(p){ return p.badge === 'new'; });
    updateActiveFilterStrip('New Arrivals', 'special');
  } else if (type === 'sale') {
    if (comingSoonSpecial.sale) { showToast('Sale / Deals coming soon!'); return; }
    list = products.filter(function(p){ return p.badge === 'sale'; });
    updateActiveFilterStrip('Sale / Deals', 'special');
  }
  renderProds(list);
  buildShopFilterBar();
}

function updateActiveFilterStrip(label, type) {
  var strip = document.getElementById('activeFilterStrip');
  if (!strip) return;
  strip.classList.add('show');
  strip.innerHTML = "<div class='active-filter-chip'>" + label +
    "<button onclick='clearActiveFilter()'>&#10005;</button></div>" +
    "<span class='filter-result-count' id='resultCount'></span>";
}

function clearActiveFilter() {
  activeFilterCat = 'all';
  activeFilterSpecial = 'all';
  renderProds(products);
  clearActiveFilterStrip();
  buildShopFilterBar();
}

function clearActiveFilterStrip() {
  var strip = document.getElementById('activeFilterStrip');
  if (strip) { strip.classList.remove('show'); strip.innerHTML = ''; }
}

/* Override filterGo to work with new system */
filterGo = function(cat) {
  go('shop');
  setTimeout(function(){ filterByCat(cat); }, 350);
};

/* Override search to reset filter bar */
var _origHandleSearch = handleSearch;
handleSearch = function() {
  activeFilterCat = 'all';
  activeFilterSpecial = 'all';
  _origHandleSearch();
  clearActiveFilterStrip();
  buildShopFilterBar();
};

/* ── ADMIN: MANAGE COMING SOON CATEGORIES ── */
function renderAdminCatManager() {
  var box = document.getElementById('adminCatManager');
  if (!box) return;

  var allCats = [].concat(shopCategories.men, shopCategories.women, shopCategories.unisex || []);
  var html = "<div style='margin-bottom:1rem'>";
  html += "<div class='admin-f-lbl' style='margin-bottom:.75rem;font-size:.8rem'>Toggle categories between Active and Coming Soon:</div>";

  allCats.forEach(function(cat) {
    var isSoon = comingSoonCats[cat.id] ? true : false;
    html += "<div style='display:flex;align-items:center;justify-content:space-between;padding:.65rem 0;border-bottom:1px solid var(--border)'>";
    html += "<span style='font-size:.88rem;color:var(--text);font-weight:500'>" + cat.label + "</span>";
    html += "<button onclick='toggleCatSoon(\""+cat.id+"\")' style='padding:.4rem 1rem;border-radius:50px;font-size:.75rem;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;border:1px solid;transition:all .2s;" +
      (isSoon ? "background:rgba(245,158,11,.12);color:#f59e0b;border-color:rgba(245,158,11,.3)" : "background:rgba(34,197,94,.1);color:var(--green);border-color:rgba(34,197,94,.25)") + "'>" +
      (isSoon ? '&#128683; Coming Soon' : '&#9989; Active') + "</button>";
    html += "</div>";
  });

  html += "</div>";
  html += "<div class='admin-f-lbl' style='margin:.75rem 0;font-size:.8rem'>Special sections:</div>";
  html += "<div style='display:flex;align-items:center;justify-content:space-between;padding:.65rem 0;border-bottom:1px solid var(--border)'>";
  html += "<span style='font-size:.88rem;color:var(--text);font-weight:500'>New Arrivals tab</span>";
  html += "<button onclick='toggleSpecialSoon(\"newArrivals\")' style='padding:.4rem 1rem;border-radius:50px;font-size:.75rem;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;border:1px solid;transition:all .2s;" +
    (comingSoonSpecial.newArrivals ? "background:rgba(245,158,11,.12);color:#f59e0b;border-color:rgba(245,158,11,.3)" : "background:rgba(34,197,94,.1);color:var(--green);border-color:rgba(34,197,94,.25)") + "'>" +
    (comingSoonSpecial.newArrivals ? '&#128683; Coming Soon' : '&#9989; Active') + "</button>";
  html += "</div>";
  html += "<div style='display:flex;align-items:center;justify-content:space-between;padding:.65rem 0'>";
  html += "<span style='font-size:.88rem;color:var(--text);font-weight:500'>Sale / Deals tab</span>";
  html += "<button onclick='toggleSpecialSoon(\"sale\")' style='padding:.4rem 1rem;border-radius:50px;font-size:.75rem;font-weight:700;cursor:pointer;font-family:DM Sans,sans-serif;border:1px solid;transition:all .2s;" +
    (comingSoonSpecial.sale ? "background:rgba(245,158,11,.12);color:#f59e0b;border-color:rgba(245,158,11,.3)" : "background:rgba(34,197,94,.1);color:var(--green);border-color:rgba(34,197,94,.25)") + "'>" +
    (comingSoonSpecial.sale ? '&#128683; Coming Soon' : '&#9989; Active') + "</button>";
  html += "</div>";

  box.innerHTML = html;
}

function toggleCatSoon(catId) {
  if (comingSoonCats[catId]) delete comingSoonCats[catId];
  else comingSoonCats[catId] = true;
  saveCatSettings();
  buildShopFilterBar();
  renderAdminCatManager();
  showToast('Category updated!');
}

function toggleSpecialSoon(key) {
  comingSoonSpecial[key] = !comingSoonSpecial[key];
  saveCatSettings();
  buildShopFilterBar();
  renderAdminCatManager();
  showToast('Section updated!');
}

function saveCatSettings() {
  try {
    localStorage.setItem('yk_cat_settings', JSON.stringify({
      comingSoonCats: comingSoonCats,
      comingSoonSpecial: comingSoonSpecial
    }));
  } catch(e) {}
}

function loadCatSettings() {
  try {
    var saved = localStorage.getItem('yk_cat_settings');
    if (saved) {
      var data = JSON.parse(saved);
      if (data.comingSoonCats) comingSoonCats = data.comingSoonCats;
      if (data.comingSoonSpecial) comingSoonSpecial = data.comingSoonSpecial;
    }
  } catch(e) {}
}

/* Init */
loadCatSettings();
setTimeout(function(){
  buildShopFilterBar();
  renderAdminCatManager();
}, 100);



/* ══ CLOUDINARY DIRECT STORAGE ══ */
var CLD_CLOUD='dlmgk5nmg';
var CLD_PRESET='yk_collection';
var CLD_BASE='https://api.cloudinary.com/v1_1/'+CLD_CLOUD;
var CLD_RAW='https://res.cloudinary.com/'+CLD_CLOUD+'/raw/upload/';

function uploadImageToCloudinary(file,callback){
  showToast('Uploading...');
  var canvas=document.createElement('canvas');
  var img=new Image();
  var reader=new FileReader();
  reader.onload=function(ev){
    img.onload=function(){
      var mW=1200,mH=1200,w=img.width,h=img.height;
      if(w>mW){h=Math.round(h*mW/w);w=mW;}
      if(h>mH){w=Math.round(w*mH/h);h=mH;}
      canvas.width=w;canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      canvas.toBlob(function(blob){
        var fd=new FormData();
        fd.append('file',blob,'product.jpg');
        fd.append('upload_preset',CLD_PRESET);
        fd.append('folder','yk-products');
        fetch(CLD_BASE+'/image/upload',{method:'POST',body:fd})
          .then(function(r){return r.json();})
          .then(function(d){
            if(d.secure_url){showToast('Uploaded! ✅');callback(d.secure_url,d.public_id);}
            else{showToast('Upload failed');callback(null,null);}
          }).catch(function(){showToast('Upload failed');callback(null,null);});
      },'image/jpeg',0.82);
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
}

function uploadJSONToCloudinary(obj,filename,onDone){
  var blob=new Blob([JSON.stringify(obj)],{type:'application/json'});
  var pubId=filename.replace('.json','');
  var fd=new FormData();
  fd.append('file',blob,filename);
  fd.append('upload_preset',CLD_PRESET);
  fd.append('public_id',pubId);
  fd.append('overwrite','true');
  fd.append('invalidate','true');
  fetch(CLD_BASE+'/raw/upload',{method:'POST',body:fd})
    .then(function(r){return r.json();})
    .then(function(d){
      if(d.secure_url||d.public_id){if(onDone)onDone(true);}
      else{console.error('Save failed:',d.error);if(onDone)onDone(false);}
    }).catch(function(e){console.error('Save error:',e);if(onDone)onDone(false);});
}

function loadJSONFromCloudinary(filename,callback){
  fetch(CLD_RAW+filename+'?t='+Date.now())
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){callback(d);})
    .catch(function(){callback(null);});
}

var _savingProds=false;
function saveProductsToCloudinary(){
  if(_savingProds)return;_savingProds=true;
  try{localStorage.setItem('yk_products_v1',JSON.stringify(products));}catch(ex){}
  uploadJSONToCloudinary(products,'yk-products.json',function(ok){
    _savingProds=false;
    showToast(ok?'✅ Saved! All devices updated':'⚠️ Cloud save failed');
  });
}

function saveReviewsToCloudinary(){
  try{localStorage.setItem('yk_reviews_v1',JSON.stringify(allReviews));}catch(ex){}
  uploadJSONToCloudinary(allReviews,'yk-reviews.json',null);
}

function loadFromCloudinary(){
  loadJSONFromCloudinary('yk-products.json',function(data){
    if(data&&Array.isArray(data)&&data.length){products=data;renderProds(products);buildShopFilterBar();}
  });
  loadJSONFromCloudinary('yk-reviews.json',function(data){
    if(data&&typeof data==='object')allReviews=data;
  });
}

function handleAdminImgUpload(input,urlId,prevId){
  var file=input.files[0];if(!file)return;
  uploadImageToCloudinary(file,function(url){
    if(url){document.getElementById(urlId).value=url;previewImg(urlId,prevId);}
    input.value='';
  });
}

function handleMultiImgUpload(input,taId){
  var files=Array.from(input.files);if(!files.length)return;
  showToast('Uploading '+files.length+' photo(s)...');
  var done=0,urls=[];
  files.forEach(function(file){
    uploadImageToCloudinary(file,function(url){
      done++;if(url)urls.push(url);
      if(done===files.length){
        var ta=document.getElementById(taId);
        var ex=ta.value.trim();
        var joined=urls.join('\n');
        ta.value=ex?(ex+'\n'+joined):joined;
        showToast('Uploaded '+urls.length+' photos!');
      }
    });
  });
  input.value='';
}

var _origSaveProducts=saveProductsToStorage;
saveProductsToStorage=function(){_origSaveProducts();saveProductsToCloudinary();};
var _origSubmitReview=submitReview;
submitReview=function(){_origSubmitReview();saveReviewsToCloudinary();};

/* ══ THEME ══ */
var currentTheme=localStorage.getItem('yk_theme')||'light';
var _slideRunning=false;
function applyTheme(theme,animate){
  if(animate&&!_slideRunning){
    _slideRunning=true;
    var w=document.createElement('div');
    w.style.cssText='position:fixed;top:0;left:0;right:0;height:100vh;z-index:99999;pointer-events:none;overflow:hidden;transform:translateY(-100%);transition:transform 1s cubic-bezier(0.25,0.1,0.1,1)';
    var inner=document.createElement('div');
    inner.style.cssText='position:absolute;inset:0;background:'+(theme==='dark'?'#080c14':'#f0f9ff')+';display:flex;align-items:center;justify-content:center';
    inner.innerHTML='<div style="font-size:3rem">'+(theme==='dark'?'&#127769;':'&#9728;')+'</div>';
    w.appendChild(inner);
    document.body.appendChild(w);
    w.getBoundingClientRect();
    w.style.transform='translateY(0%)';
    setTimeout(function(){
      document.documentElement.setAttribute('data-theme',theme);
      updateThemeBtn(theme);currentTheme=theme;
      try{localStorage.setItem('yk_theme',theme);}catch(ex){}
    },500);
    setTimeout(function(){
      w.style.transition='transform 0.4s ease-in';
      w.style.transform='translateY(100%)';
      setTimeout(function(){if(w.parentNode)w.parentNode.removeChild(w);_slideRunning=false;},450);
    },1100);
  }else{
    document.documentElement.setAttribute('data-theme',theme);
    updateThemeBtn(theme);currentTheme=theme;
    try{localStorage.setItem('yk_theme',theme);}catch(ex){}
  }
}
function updateThemeBtn(theme){
  document.querySelectorAll('.theme-toggle').forEach(function(btn){
    btn.innerHTML=theme==='dark'?'&#9728;':'&#9790;';
  });
}
function toggleTheme(){if(!_slideRunning)applyTheme(currentTheme==='light'?'dark':'light',true);}
applyTheme(currentTheme,false);
loadFromCloudinary();
