(() => {
  'use strict';

  // ---------- أدوات ----------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'حدث خطأ، حاول مرة أخرى');
    return data;
  }

  const state = { config: { currency: 'ر.س', whatsapp: '', address: '', mapUrl: '' }, user: null, category: 'all', q: '', products: [], cart: [] };
  const fmt = (n) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${state.config.currency}`;

  function toast(msg, isError = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    $('#toastBox').appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  // ---------- السلة (محفوظة في المتصفح) ----------
  function loadCart() {
    try { state.cart = JSON.parse(localStorage.getItem('hb_cart') || '[]'); } catch { state.cart = []; }
    if (!Array.isArray(state.cart)) state.cart = [];
  }
  function saveCart() {
    localStorage.setItem('hb_cart', JSON.stringify(state.cart));
    const n = state.cart.reduce((s, i) => s + i.qty, 0);
    $('#cartCount').textContent = n;
  }
  const cartTotal = () => state.cart.reduce((s, i) => s + i.price * i.qty, 0);

  function addToCart(p, variantIndex, image) {
    const v = p.type === 'incense' ? p.variants[variantIndex] : null;
    const key = `${p.id}:${v ? variantIndex : ''}`;
    const found = state.cart.find((i) => i.key === key);
    if (found) found.qty += 1;
    else {
      state.cart.push({
        key, product_id: p.id, variant_index: v ? variantIndex : null,
        name: p.name, size: v ? v.size : '', price: v ? v.price : p.price, image: image || '', qty: 1,
      });
    }
    saveCart();
    toast(`تمت إضافة "${p.name}" إلى السلة`);
  }

  // ---------- بطاقة المنتج ----------
  function cardImages(p) {
    if (p.type === 'perfume') return p.images || [];
    const list = [];
    p.variants.forEach((v) => { if (v.image && !list.includes(v.image)) list.push(v.image); });
    return list;
  }
  const hasDiscount = (p) =>
    p.type === 'perfume' ? p.old_price > p.price : p.variants.some((v) => v.old_price > v.price);

  function createCard(p) {
    const imgs = cardImages(p);
    let imgIdx = 0;
    let vIdx = 0;
    const el = document.createElement('article');
    el.className = 'card';
    el.innerHTML = `
      <div class="slider">
        <div class="badges">
          ${p.is_best_seller ? '<span class="badge best">الأكثر مبيعًا</span>' : ''}
          ${hasDiscount(p) ? '<span class="badge sale">خصم</span>' : ''}
          ${p.out_of_stock ? '<span class="badge soldout">نفدت الكمية</span>' : ''}
        </div>
        <div class="slide"></div>
        ${imgs.length > 1 ? `
          <button class="arrow prev" type="button" aria-label="الصورة السابقة">›</button>
          <button class="arrow next" type="button" aria-label="الصورة التالية">‹</button>
          <div class="dots">${imgs.map(() => '<span></span>').join('')}</div>` : ''}
      </div>
      <div class="card-body">
        <span class="card-type">${p.type === 'incense' ? 'بخور' : 'عطر'}</span>
        <h3 class="card-name">${esc(p.name)}</h3>
        ${p.type === 'incense' ? `
          <select aria-label="الحجم">
            ${p.variants.map((v, i) => `<option value="${i}">${esc(v.size)}</option>`).join('')}
          </select>` : ''}
        <div class="price"></div>
        <button class="btn btn-block add" type="button" ${p.out_of_stock ? 'disabled' : ''}>${p.out_of_stock ? 'نفدت الكمية' : 'إضافة للسلة'}</button>
      </div>`;

    const slide = $('.slide', el);
    const dots = el.querySelectorAll('.dots span');
    const priceBox = $('.price', el);

    function showImage(i) {
      if (!imgs.length) { slide.innerHTML = '<div class="noimg">حجة بتول</div>'; return; }
      imgIdx = (i + imgs.length) % imgs.length;
      slide.innerHTML = `<img src="${esc(imgs[imgIdx])}" alt="${esc(p.name)}" loading="lazy">`;
      dots.forEach((d, k) => d.classList.toggle('on', k === imgIdx));
    }
    slide.addEventListener('click', () => { if (imgs.length) openZoom(imgs[imgIdx], p.name); });
    function showPrice() {
      const src = p.type === 'incense' ? p.variants[vIdx] : p;
      priceBox.innerHTML = src.old_price > src.price
        ? `<span class="now">${fmt(src.price)}</span><span class="old">${fmt(src.old_price)}</span>`
        : `<span class="now">${fmt(src.price)}</span>`;
    }
    showImage(0);
    showPrice();

    const prev = $('.prev', el), next = $('.next', el);
    if (prev) {
      prev.addEventListener('click', () => showImage(imgIdx - 1));
      next.addEventListener('click', () => showImage(imgIdx + 1));
      // السحب باللمس (في الواجهة العربية السحب لليمين = التالي)
      let x0 = null;
      const slider = $('.slider', el);
      slider.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      slider.addEventListener('touchend', (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) showImage(imgIdx + (dx > 0 ? 1 : -1));
        x0 = null;
      });
    }

    const sel = $('select', el);
    if (sel) {
      sel.addEventListener('change', () => {
        vIdx = Number(sel.value);
        showPrice();
        const vi = imgs.indexOf(p.variants[vIdx].image);
        if (vi >= 0) showImage(vi);
      });
    }

    $('.add', el).addEventListener('click', () => {
      const image = p.type === 'incense' ? p.variants[vIdx].image || imgs[0] : imgs[0];
      addToCart(p, vIdx, image);
    });
    return el;
  }

  // ---------- عرض المنتجات ----------
  const TITLES = { all: 'كل المنتجات', incense: 'البخور', perfume: 'العطور', bestsellers: 'الأكثر مبيعًا', offers: 'العروض' };

  function section(title, list) {
    const wrap = document.createElement('section');
    wrap.innerHTML = `<h2 class="section-title">${esc(title)}</h2><div class="grid"></div>`;
    const grid = $('.grid', wrap);
    list.forEach((p) => grid.appendChild(createCard(p)));
    return wrap;
  }

  function renderProducts() {
    const main = $('#main');
    main.innerHTML = '';
    if (!state.products.length) {
      main.innerHTML = `<div class="empty"><p>${state.q ? 'لا توجد منتجات مطابقة لبحثك.' : 'لا توجد منتجات في هذا القسم حاليًا.'}</p></div>`;
      return;
    }
    if (state.category === 'all' && !state.q) {
      const best = state.products.filter((p) => p.is_best_seller);
      if (best.length) main.appendChild(section('الأكثر مبيعًا', best));
    }
    main.appendChild(section(state.q ? `نتائج البحث عن "${state.q}"` : TITLES[state.category], state.products));
  }

  let reqId = 0;
  async function loadProducts() {
    const id = ++reqId;
    try {
      const qs = new URLSearchParams({ category: state.category, q: state.q });
      const data = await api('/api/products?' + qs);
      if (id !== reqId) return; // تجاهل النتائج القديمة
      state.products = data.products;
      renderProducts();
    } catch (e) {
      $('#main').innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`;
    }
  }

  // ---------- النوافذ ----------
  const layer = $('#layer');
  function closeLayer() { layer.innerHTML = ''; document.body.style.overflow = ''; }
  function openLayer(html) {
    layer.innerHTML = `<div class="overlay" data-close></div>${html}`;
    document.body.style.overflow = 'hidden';
    layer.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeLayer));
    return layer;
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLayer(); });

  function openZoom(url, alt) {
    openLayer(`
      <div class="zoom-layer" role="dialog" aria-label="${esc(alt || 'صورة مكبّرة')}" data-close>
        <button class="icon-btn zoom-close" data-close aria-label="إغلاق">×</button>
        <img class="zoom-img" src="${esc(url)}" alt="${esc(alt || '')}">
      </div>`);
  }

  function openCart() {
    const items = state.cart;
    openLayer(`
      <aside class="drawer" role="dialog" aria-label="السلة">
        <div class="drawer-head"><h2>السلة</h2><button class="icon-btn" data-close aria-label="إغلاق">×</button></div>
        <div class="drawer-body">
          ${items.length ? items.map((i) => `
            <div class="cart-item" data-key="${esc(i.key)}">
              ${i.image ? `<img src="${esc(i.image)}" alt="">` : '<div class="ph"></div>'}
              <div>
                <h3>${esc(i.name)}${i.size ? ' - ' + esc(i.size) : ''}</h3>
                <div class="unit">${fmt(i.price)}</div>
                <div class="qty">
                  <button type="button" data-act="minus" aria-label="إنقاص">−</button>
                  <span>${i.qty}</span>
                  <button type="button" data-act="plus" aria-label="زيادة">+</button>
                </div>
                <span class="cart-line-total">${fmt(i.price * i.qty)}</span>
              </div>
            </div>`).join('')
            : '<div class="empty">السلة فارغة. أضف منتجات من المتجر.</div>'}
        </div>
        ${items.length ? `
        <div class="drawer-foot">
          <div class="total-row"><span>المجموع</span><span>${fmt(cartTotal())}</span></div>
          <button class="btn btn-brass btn-block" id="goCheckout" type="button">إتمام الشراء</button>
        </div>` : ''}
      </aside>`);

    layer.querySelectorAll('.cart-item').forEach((row) => {
      const item = state.cart.find((i) => i.key === row.dataset.key);
      row.querySelector('[data-act="plus"]').addEventListener('click', () => {
        if (item.qty < 99) item.qty += 1;
        saveCart(); openCart();
      });
      row.querySelector('[data-act="minus"]').addEventListener('click', () => {
        item.qty -= 1;
        if (item.qty <= 0) state.cart = state.cart.filter((i) => i !== item);
        saveCart(); openCart();
      });
    });
    const go = $('#goCheckout');
    if (go) go.addEventListener('click', openCheckout);
  }

  function openCheckout() {
    if (!state.cart.length) { toast('السلة فارغة، أضف منتجًا أولًا', true); return; }
    const u = state.user;
    openLayer(`
      <div class="modal" role="dialog" aria-label="إتمام الشراء">
        <div class="modal-head"><h2>إتمام الشراء</h2><button class="icon-btn" data-close aria-label="إغلاق">×</button></div>
        <form class="modal-body" id="checkoutForm" novalidate>
          <div class="summary">
            ${state.cart.map((i) => `<div><span>${esc(i.name)}${i.size ? ' - ' + esc(i.size) : ''} × ${i.qty}</span><span>${fmt(i.price * i.qty)}</span></div>`).join('')}
            <div style="font-weight:800;margin-top:.4rem"><span>المجموع</span><span>${fmt(cartTotal())}</span></div>
          </div>
          <div class="field"><label for="cName">اسم العميل</label>
            <input id="cName" autocomplete="name" required value="${esc(u ? u.username : '')}"></div>
          <div class="field"><label for="cPhone">رقم الهاتف</label>
            <input id="cPhone" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(u ? u.phone : '')}"></div>
          <p class="form-error" id="cErr" role="alert"></p>
          <button class="btn btn-brass btn-block" type="submit" id="cSubmit">تأكيد الطلب</button>
        </form>
      </div>`);

    $('#checkoutForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#cSubmit');
      const err = $('#cErr');
      err.textContent = '';
      const name = $('#cName').value.trim();
      const phone = $('#cPhone').value.trim();
      if (name.length < 2) { err.textContent = 'أدخل اسم العميل'; return; }
      if (!/^[0-9+\s-]{7,20}$/.test(phone)) { err.textContent = 'أدخل رقم هاتف صحيح'; return; }
      btn.disabled = true; btn.textContent = 'جارٍ إرسال الطلب…';
      try {
        const data = await api('/api/orders', {
          method: 'POST',
          body: {
            customer_name: name, phone,
            items: state.cart.map((i) => ({ product_id: i.product_id, variant_index: i.variant_index, quantity: i.qty })),
          },
        });
        state.cart = []; saveCart();
        $('.modal').innerHTML = `
          <div class="modal-body success">
            <div class="tick">✓</div>
            <h2 style="font-family:var(--font-display);margin:0">تم استلام طلبك</h2>
            <p>رقم الطلب: <strong>${data.order_id}</strong><br>المجموع: <strong>${fmt(data.total)}</strong><br>سنتواصل معك على الرقم الذي أدخلته لتأكيد الطلب.</p>
            <button class="btn btn-block" data-close type="button">حسنًا</button>
          </div>`;
        layer.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeLayer));
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false; btn.textContent = 'تأكيد الطلب';
      }
    });
  }

  function openContact() {
    const n = state.config.whatsapp;
    const addr = state.config.address;
    const mapUrl = state.config.mapUrl;
    openLayer(`
      <div class="modal" role="dialog" aria-label="تواصل معنا">
        <div class="modal-head"><h2>تواصل معنا</h2><button class="icon-btn" data-close aria-label="إغلاق">×</button></div>
        <div class="modal-body">
          ${n ? `
            <p style="margin:0">يسعدنا خدمتك والإجابة عن استفساراتك.</p>
            <a class="btn btn-brass btn-block" target="_blank" rel="noopener" href="https://wa.me/${esc(n)}">مراسلتنا على واتساب</a>
            <a class="btn btn-ghost btn-block" target="_blank" rel="noopener" href="https://www.facebook.com/share/19HKw3wJNt/">صفحتنا على فيسبوك</a>
            <a class="btn btn-ghost btn-block" href="tel:+${esc(n)}">اتصال هاتفي</a>`
          : '<p style="margin:0">أضف رقم واتساب المتجر في إعدادات الموقع (WHATSAPP_NUMBER) ليظهر هنا.</p>'}
          ${addr ? `
            <div style="border-top:1px solid var(--line);margin-top:.4rem;padding-top:.8rem">
              <p style="margin:0 0 .5rem;font-weight:700">📍 موقع المتجر</p>
              <p style="margin:0">${esc(addr)}</p>
              ${mapUrl ? `<a class="btn btn-ghost btn-block" style="margin-top:.6rem" target="_blank" rel="noopener" href="${esc(mapUrl)}">عرض الموقع على الخريطة</a>` : ''}
            </div>` : ''}
        </div>
      </div>`);
  }

  // ---------- الهيدر ----------
  function renderAuth() {
    const box = $('#authArea');
    const u = state.user;
    if (!u) {
      box.innerHTML = '<a class="hbtn" href="/login.html">تسجيل الدخول</a>';
      return;
    }
    box.innerHTML = `
      <span class="user-name">${esc(u.username)}</span>
      ${u.role === 'admin' ? '<a class="hbtn" href="/admin">لوحة التحكم</a>' : ''}
      <button class="hbtn" id="btnLogout" type="button">تسجيل الخروج</button>`;
    $('#btnLogout').addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
      state.user = null; renderAuth(); toast('تم تسجيل الخروج');
    });
  }

  function bindHeader() {
    $('#btnCart').addEventListener('click', openCart);
    $('#btnContact').addEventListener('click', openContact);
    $('#btnBuy').addEventListener('click', () => {
      if (state.cart.length) openCheckout();
      else { toast('السلة فارغة، اختر منتجًا أولًا', true); $('#main').scrollIntoView({ behavior: 'smooth' }); }
    });
    $('#logoImg').addEventListener('error', (e) => { e.target.style.display = 'none'; });
    $('#logoImg').addEventListener('click', (e) => {
      e.preventDefault();
      openZoom('/images/logo.png', 'شعار حجة بتول');
    });

    $('#cats').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-cat]');
      if (!b) return;
      state.category = b.dataset.cat;
      document.querySelectorAll('#cats button').forEach((x) => x.classList.toggle('active', x === b));
      loadProducts();
    });

    let timer;
    $('#search').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = e.target.value.trim(); loadProducts(); }, 300);
    });
  }

  // ---------- البدء ----------
  async function start() {
    loadCart(); saveCart();
    bindHeader();
    $('#main').innerHTML = '<div class="empty">جارٍ تحميل المنتجات…</div>';
    const [cfg, me] = await Promise.all([
      api('/api/config').catch(() => null),
      api('/api/auth/me').catch(() => ({ user: null })),
    ]);
    if (cfg) state.config = cfg;
    state.user = me.user;
    renderAuth();
    loadProducts();
  }
  start();
})();
        ? `<span class="now">${fmt(src.price)}</span><span class="old">${fmt(src.old_price)}</span>`
        : `<span class="now">${fmt(src.price)}</span>`;
    }
    showImage(0);
    showPrice();

    const prev = $('.prev', el), next = $('.next', el);
    if (prev) {
      prev.addEventListener('click', () => showImage(imgIdx - 1));
      next.addEventListener('click', () => showImage(imgIdx + 1));
      // السحب باللمس (في الواجهة العربية السحب لليمين = التالي)
      let x0 = null;
      const slider = $('.slider', el);
      slider.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      slider.addEventListener('touchend', (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) showImage(imgIdx + (dx > 0 ? 1 : -1));
        x0 = null;
      });
    }

    const sel = $('select', el);
    if (sel) {
      sel.addEventListener('change', () => {
        vIdx = Number(sel.value);
        showPrice();
        const vi = imgs.indexOf(p.variants[vIdx].image);
        if (vi >= 0) showImage(vi);
      });
    }

    $('.add', el).addEventListener('click', () => {
      const image = p.type === 'incense' ? p.variants[vIdx].image || imgs[0] : imgs[0];
      addToCart(p, vIdx, image);
    });
    return el;
  }

  // ---------- عرض المنتجات ----------
  const TITLES = { all: 'كل المنتجات', incense: 'البخور', perfume: 'العطور', bestsellers: 'الأكثر مبيعًا', offers: 'العروض' };

  function section(title, list) {
    const wrap = document.createElement('section');
    wrap.innerHTML = `<h2 class="section-title">${esc(title)}</h2><div class="grid"></div>`;
    const grid = $('.grid', wrap);
    list.forEach((p) => grid.appendChild(createCard(p)));
    return wrap;
  }

  function renderProducts() {
    const main = $('#main');
    main.innerHTML = '';
    if (!state.products.length) {
      main.innerHTML = `<div class="empty"><p>${state.q ? 'لا توجد منتجات مطابقة لبحثك.' : 'لا توجد منتجات في هذا القسم حاليًا.'}</p></div>`;
      return;
    }
    if (state.category === 'all' && !state.q) {
      const best = state.products.filter((p) => p.is_best_seller);
      if (best.length) main.appendChild(section('الأكثر مبيعًا', best));
    }
    main.appendChild(section(state.q ? `نتائج البحث عن "${state.q}"` : TITLES[state.category], state.products));
  }

  let reqId = 0;
  async function loadProducts() {
    const id = ++reqId;
    try {
      const qs = new URLSearchParams({ category: state.category, q: state.q });
      const data = await api('/api/products?' + qs);
      if (id !== reqId) return; // تجاهل النتائج القديمة
      state.products = data.products;
      renderProducts();
    } catch (e) {
      $('#main').innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`;
    }
  }

  // ---------- النوافذ ----------
  const layer = $('#layer');
  function closeLayer() { layer.innerHTML = ''; document.body.style.overflow = ''; }
  function openLayer(html) {
    layer.innerHTML = `<div class="overlay" data-close></div>${html}`;
    document.body.style.overflow = 'hidden';
    layer.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeLayer));
    return layer;
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLayer(); });

  function openCart() {
    const items = state.cart;
    openLayer(`
      <aside class="drawer" role="dialog" aria-label="السلة">
        <div class="drawer-head"><h2>السلة</h2><button class="icon-btn" data-close aria-label="إغلاق">×</button></div>
        <div class="drawer-body">
          ${items.length ? items.map((i) => `
            <div class="cart-item" data-key="${esc(i.key)}">
              ${i.image ? `<img src="${esc(i.image)}" alt="">` : '<div class="ph"></div>'}
              <div>
                <h3>${esc(i.name)}${i.size ? ' - ' + esc(i.size) : ''}</h3>
                <div class="unit">${fmt(i.price)}</div>
                <div class="qty">
                  <button type="button" data-act="minus" aria-label="إنقاص">−</button>
                  <span>${i.qty}</span>
                  <button type="button" data-act="plus" aria-label="زيادة">+</button>
                </div>
                <span class="cart-line-total">${fmt(i.price * i.qty)}</span>
              </div>
            </div>`).join('')
            : '<div class="empty">السلة فارغة. أضف منتجات من المتجر.</div>'}
        </div>
        ${items.length ? `
        <div class="drawer-foot">
          <div class="total-row"><span>المجموع</span><span>${fmt(cartTotal())}</span></div>
          <button class="btn btn-brass btn-block" id="goCheckout" type="button">إتمام الشراء</button>
        </div>` : ''}
      </aside>`);

    layer.querySelectorAll('.cart-item').forEach((row) => {
      const item = state.cart.find((i) => i.key === row.dataset.key);
      row.querySelector('[data-act="plus"]').addEventListener('click', () => {
        if (item.qty < 99) item.qty += 1;
        saveCart(); openCart();
      });
      row.querySelector('[data-act="minus"]').addEventListener('click', () => {
        item.qty -= 1;
        if (item.qty <= 0) state.cart = state.cart.filter((i) => i !== item);
        saveCart(); openCart();
      });
    });
    const go = $('#goCheckout');
    if (go) go.addEventListener('click', openCheckout);
  }

  function openCheckout() {
    if (!state.cart.length) { toast('السلة فارغة، أضف منتجًا أولًا', true); return; }
    const u = state.user;
    openLayer(`
      <div class="modal" role="dialog" aria-label="إتمام الشراء">
        <div class="modal-head"><h2>إتمام الشراء</h2><button class="icon-btn" data-close aria-label="إغلاق">×</button></div>
        <form class="modal-body" id="checkoutForm" novalidate>
          <div class="summary">
            ${state.cart.map((i) => `<div><span>${esc(i.name)}${i.size ? ' - ' + esc(i.size) : ''} × ${i.qty}</span><span>${fmt(i.price * i.qty)}</span></div>`).join('')}
            <div style="font-weight:800;margin-top:.4rem"><span>المجموع</span><span>${fmt(cartTotal())}</span></div>
          </div>
          <div class="field"><label for="cName">اسم العميل</label>
            <input id="cName" autocomplete="name" required value="${esc(u ? u.username : '')}"></div>
          <div class="field"><label for="cPhone">رقم الهاتف</label>
            <input id="cPhone" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(u ? u.phone : '')}"></div>
          <p class="form-error" id="cErr" role="alert"></p>
          <button class="btn btn-brass btn-block" type="submit" id="cSubmit">تأكيد الطلب</button>
        </form>
      </div>`);

    $('#checkoutForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#cSubmit');
      const err = $('#cErr');
      err.textContent = '';
      const name = $('#cName').value.trim();
      const phone = $('#cPhone').value.trim();
      if (name.length < 2) { err.textContent = 'أدخل اسم العميل'; return; }
      if (!/^[0-9+\s-]{7,20}$/.test(phone)) { err.textContent = 'أدخل رقم هاتف صحيح'; return; }
      btn.disabled = true; btn.textContent = 'جارٍ إرسال الطلب…';
      try {
        const data = await api('/api/orders', {
          method: 'POST',
          body: {
            customer_name: name, phone,
            items: state.cart.map((i) => ({ product_id: i.product_id, variant_index: i.variant_index, quantity: i.qty })),
          },
        });
        state.cart = []; saveCart();
        $('.modal').innerHTML = `
          <div class="modal-body success">
            <div class="tick">✓</div>
            <h2 style="font-family:var(--font-display);margin:0">تم استلام طلبك</h2>
            <p>رقم الطلب: <strong>${data.order_id}</strong><br>المجموع: <strong>${fmt(data.total)}</strong><br>سنتواصل معك على الرقم الذي أدخلته لتأكيد الطلب.</p>
            <button class="btn btn-block" data-close type="button">حسنًا</button>
          </div>`;
        layer.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeLayer));
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false; btn.textContent = 'تأكيد الطلب';
      }
    });
  }

  function openContact() {
    const n = state.config.whatsapp;
    const addr = state.config.address;
    const mapUrl = state.config.mapUrl;
    openLayer(`
      <div class="modal" role="dialog" aria-label="تواصل معنا">
        <div class="modal-head"><h2>تواصل معنا</h2><button class="icon-btn" data-close aria-label="إغلاق">×</button></div>
        <div class="modal-body">
          ${n ? `
            <p style="margin:0">يسعدنا خدمتك والإجابة عن استفساراتك.</p>
            <a class="btn btn-brass btn-block" target="_blank" rel="noopener" href="https://wa.me/${esc(n)}">مراسلتنا على واتساب</a>
            <a class="btn btn-ghost btn-block" target="_blank" rel="noopener" href="https://www.facebook.com/share/19HKw3wJNt/">صفحتنا على فيسبوك</a>
            <a class="btn btn-ghost btn-block" href="tel:+${esc(n)}">اتصال هاتفي</a>`
          : '<p style="margin:0">أضف رقم واتساب المتجر في إعدادات الموقع (WHATSAPP_NUMBER) ليظهر هنا.</p>'}
          ${addr ? `
            <div style="border-top:1px solid var(--line);margin-top:.4rem;padding-top:.8rem">
              <p style="margin:0 0 .5rem;font-weight:700">📍 موقع المتجر</p>
              <p style="margin:0">${esc(addr)}</p>
              ${mapUrl ? `<a class="btn btn-ghost btn-block" style="margin-top:.6rem" target="_blank" rel="noopener" href="${esc(mapUrl)}">عرض الموقع على الخريطة</a>` : ''}
            </div>` : ''}
        </div>
      </div>`);
  }

  // ---------- الهيدر ----------
  function renderAuth() {
    const box = $('#authArea');
    const u = state.user;
    if (!u) {
      box.innerHTML = '<a class="hbtn" href="/login.html">تسجيل الدخول</a>';
      return;
    }
    box.innerHTML = `
      <span class="user-name">${esc(u.username)}</span>
      ${u.role === 'admin' ? '<a class="hbtn" href="/admin">لوحة التحكم</a>' : ''}
      <button class="hbtn" id="btnLogout" type="button">تسجيل الخروج</button>`;
    $('#btnLogout').addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
      state.user = null; renderAuth(); toast('تم تسجيل الخروج');
    });
  }

  function bindHeader() {
    $('#btnCart').addEventListener('click', openCart);
    $('#btnContact').addEventListener('click', openContact);
    $('#btnBuy').addEventListener('click', () => {
      if (state.cart.length) openCheckout();
      else { toast('السلة فارغة، اختر منتجًا أولًا', true); $('#main').scrollIntoView({ behavior: 'smooth' }); }
    });
    $('#logoImg').addEventListener('error', (e) => { e.target.style.display = 'none'; });

    $('#cats').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-cat]');
      if (!b) return;
      state.category = b.dataset.cat;
      document.querySelectorAll('#cats button').forEach((x) => x.classList.toggle('active', x === b));
      loadProducts();
    });

    let timer;
    $('#search').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = e.target.value.trim(); loadProducts(); }, 300);
    });
  }

  // ---------- البدء ----------
  async function start() {
    loadCart(); saveCart();
    bindHeader();
    $('#main').innerHTML = '<div class="empty">جارٍ تحميل المنتجات…</div>';
    const [cfg, me] = await Promise.all([
      api('/api/config').catch(() => null),
      api('/api/auth/me').catch(() => ({ user: null })),
    ]);
    if (cfg) state.config = cfg;
    state.user = me.user;
    renderAuth();
    loadProducts();
  }
  start();
})();
