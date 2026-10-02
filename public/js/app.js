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

  function isOutOfStock(p, vIdx) {
    return p.type === 'incense' ? !!(p.variants[vIdx] && p.variants[vIdx].out_of_stock) : !!p.out_of_stock;
  }

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
          ${p.type === 'perfume' && p.out_of_stock ? '<span class="badge soldout">نفدت الكمية</span>' : ''}
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
          <div class="size-chips" role="group" aria-label="الحجم">
            ${p.variants.map((v, i) => `
              <button type="button" class="chip${i === 0 ? ' on' : ''}${v.out_of_stock ? ' disabled' : ''}" data-i="${i}" ${v.out_of_stock ? 'disabled' : ''}>
                ${esc(v.size)}${v.out_of_stock ? '<span class="chip-sub">نفدت</span>' : `<span class="chip-sub">${fmt(v.price)}</span>`}
              </button>`).join('')}
          </div>` : ''}
        <div class="price"></div>
        <button class="btn btn-block add" type="button">إضافة للسلة</button>
        <a class="btn btn-ghost btn-block wa-order" target="_blank" rel="noopener">🟢 اطلب عبر واتساب</a>
      </div>`;

    const slide = $('.slide', el);
    const dots = el.querySelectorAll('.dots span');
    const priceBox = $('.price', el);
    const addBtn = $('.add', el);
    const waBtn = $('.wa-order', el);
    const chips = el.querySelectorAll('.chip');

    function showImage(i, fromVariant) {
      if (!imgs.length) { slide.innerHTML = '<div class="noimg">حجة بتول</div>'; return; }
      imgIdx = (i + imgs.length) % imgs.length;
      slide.innerHTML = `<img src="${esc(imgs[imgIdx])}" alt="${esc(p.name)}" loading="lazy">`;
      dots.forEach((d, k) => d.classList.toggle('on', k === imgIdx));
      // مزامنة الحجم مع الصورة المعروضة (السحب أو الأسهم) تلقائيًا
      if (!fromVariant && p.type === 'incense') {
        const matchIdx = p.variants.findIndex((v) => v.image === imgs[imgIdx]);
        if (matchIdx >= 0 && matchIdx !== vIdx) selectVariant(matchIdx, true);
      }
    }
    slide.addEventListener('click', () => { if (imgs.length) openZoom(imgs[imgIdx], p.name); });

    function showPrice() {
      const src = p.type === 'incense' ? p.variants[vIdx] : p;
      priceBox.innerHTML = src.old_price > src.price
        ? `<span class="now">${fmt(src.price)}</span><span class="old">${fmt(src.old_price)}</span>`
        : `<span class="now">${fmt(src.price)}</span>`;
    }

    function updateAvailability() {
      const out = isOutOfStock(p, vIdx);
      addBtn.disabled = out;
      addBtn.textContent = out ? 'نفدت الكمية' : 'إضافة للسلة';
      addBtn.classList.toggle('btn-disabled', out);
    }

    function updateWaLink() {
      const n = state.config.whatsapp;
      if (!n) { waBtn.style.display = 'none'; return; }
      const sizeTxt = p.type === 'incense' ? ` - الحجم: ${p.variants[vIdx].size}` : '';
      const text = `السلام عليكم، أريد طلب "${p.name}"${sizeTxt}`;
      waBtn.href = `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
    }

    function selectVariant(i, skipImageSync) {
      vIdx = i;
      chips.forEach((c) => c.classList.toggle('on', Number(c.dataset.i) === vIdx));
      showPrice();
      updateAvailability();
      updateWaLink();
      if (!skipImageSync) {
        const vi = imgs.indexOf(p.variants[vIdx].image);
        if (vi >= 0) showImage(vi, true);
      }
    }

    showImage(0, true);
    showPrice();
    updateAvailability();
    updateWaLink();

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

    chips.forEach((c) => {
      c.addEventListener('click', () => { if (!c.disabled) selectVariant(Number(c.dataset.i)); });
    });

    addBtn.addEventListener('click', () => {
      if (isOutOfStock(p, vIdx)) return;
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

  async function openCheckout() {
    if (!state.cart.length) { toast('السلة فارغة، أضف منتجًا أولًا', true); return; }
    const u = state.user;
    let zones = [];
    try { zones = (await api('/api/delivery')).zones; } catch (_) {}
    const co = { code: '', discount: 0 }; // الكوبون المُطبَّق حاليًا

    const renderSummary = () => {
      const city = $('#cCity') ? $('#cCity').value : '';
      const zone = zones.find((z) => z.city === city);
      const deliveryPrice = zone ? zone.price : 0;
      const sub = cartTotal();
      const total = Math.max(0, sub + deliveryPrice - co.discount);
      const box = $('#cSummary');
      if (box) {
        box.innerHTML = `
          ${state.cart.map((i) => `<div><span>${esc(i.name)}${i.size ? ' - ' + esc(i.size) : ''} × ${i.qty}</span><span>${fmt(i.price * i.qty)}</span></div>`).join('')}
          <div><span>المجموع الفرعي</span><span>${fmt(sub)}</span></div>
          ${deliveryPrice ? `<div><span>التوصيل (${esc(city)})</span><span>${fmt(deliveryPrice)}</span></div>` : ''}
          ${co.discount ? `<div><span>خصم (${esc(co.code)})</span><span>-${fmt(co.discount)}</span></div>` : ''}
          <div style="font-weight:800;margin-top:.4rem"><span>الإجمالي</span><span>${fmt(total)}</span></div>`;
      }
      return { city, deliveryPrice, total };
    };

    openLayer(`
      <div class="modal" role="dialog" aria-label="إتمام الشراء">
        <div class="modal-head"><h2>إتمام الشراء</h2><button class="icon-btn" data-close aria-label="إغلاق">×</button></div>
        <form class="modal-body" id="checkoutForm" novalidate>
          <div class="summary" id="cSummary"></div>
          <div class="field"><label for="cName">اسم العميل</label>
            <input id="cName" autocomplete="name" required value="${esc(u ? u.username : '')}"></div>
          <div class="field"><label for="cPhone">رقم الهاتف</label>
            <input id="cPhone" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(u ? u.phone : '')}"></div>
          ${zones.length ? `
          <div class="field"><label for="cCity">المدينة / المنطقة (للتوصيل)</label>
            <select id="cCity">
              <option value="">بدون توصيل (استلام شخصي)</option>
              ${zones.map((z) => `<option value="${esc(z.city)}">${esc(z.city)} — ${fmt(z.price)}</option>`).join('')}
            </select></div>` : ''}
          <div class="field"><label for="cCoupon">كود الخصم (اختياري)</label>
            <div style="display:flex;gap:.5rem">
              <input id="cCoupon" style="flex:1" autocapitalize="characters">
              <button class="btn btn-ghost" type="button" id="cApplyCoupon">تطبيق</button>
            </div>
            <p class="form-error" id="cCouponMsg" role="alert" style="margin:0"></p>
          </div>
          <p class="form-error" id="cErr" role="alert"></p>
          <button class="btn btn-brass btn-block" type="submit" id="cSubmit">تأكيد الطلب</button>
        </form>
      </div>`);

    renderSummary();
    const citySel = $('#cCity');
    if (citySel) citySel.addEventListener('change', renderSummary);

    $('#cApplyCoupon').addEventListener('click', async () => {
      const code = $('#cCoupon').value.trim();
      const msg = $('#cCouponMsg');
      msg.textContent = '';
      if (!code) return;
      try {
        const data = await api('/api/coupons/validate', { method: 'POST', body: { code, subtotal: cartTotal() } });
        co.code = data.code; co.discount = data.discount;
        msg.style.color = 'var(--ok)';
        msg.textContent = `تم تطبيق الخصم: -${fmt(data.discount)}`;
        renderSummary();
      } catch (ex) {
        co.code = ''; co.discount = 0;
        msg.style.color = '';
        msg.textContent = ex.message;
        renderSummary();
      }
    });

    $('#checkoutForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#cSubmit');
      const err = $('#cErr');
      err.textContent = '';
      const name = $('#cName').value.trim();
      const phone = $('#cPhone').value.trim();
      if (name.length < 2) { err.textContent = 'أدخل اسم العميل'; return; }
      if (!/^[0-9+\s-]{7,20}$/.test(phone)) { err.textContent = 'أدخل رقم هاتف صحيح'; return; }
      const { city } = renderSummary();
      btn.disabled = true; btn.textContent = 'جارٍ إرسال الطلب…';
      try {
        const data = await api('/api/orders', {
          method: 'POST',
          body: {
            customer_name: name, phone,
            items: state.cart.map((i) => ({ product_id: i.product_id, variant_index: i.variant_index, quantity: i.qty })),
            delivery_city: city || undefined,
            coupon_code: co.code || undefined,
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

  const ORDER_STATUS_LABELS = { new: 'جديد', confirmed: 'مؤكد', shipped: 'تم الشحن', done: 'مكتمل', cancelled: 'ملغي' };

  async function openMyOrders() {
    openLayer(`
      <aside class="drawer" role="dialog" aria-label="طلباتي">
        <div class="drawer-head"><h2>طلباتي</h2><button class="icon-btn" data-close aria-label="إغلاق">×</button></div>
        <div class="drawer-body" id="myOrdersBody"><div class="empty">جارٍ التحميل…</div></div>
      </aside>`);
    const box = $('#myOrdersBody');
    try {
      const { orders } = await api('/api/orders/mine');
      if (!orders.length) { box.innerHTML = '<div class="empty">لا توجد طلبات سابقة بعد.</div>'; return; }
      box.innerHTML = orders.map((o) => `
        <div class="my-order">
          <div class="my-order-head">
            <strong>طلب رقم ${o.id}</strong>
            <span class="status-pill status-${esc(o.status)}">${esc(ORDER_STATUS_LABELS[o.status] || o.status)}</span>
          </div>
          <div class="meta">${new Date(o.created_at).toLocaleString('ar-EG')}</div>
          <ul>${o.items.map((i) => `<li>${esc(i.name)} × ${i.quantity} — ${fmt(i.price * i.quantity)}</li>`).join('')}</ul>
          ${o.delivery_city ? `<div class="meta">التوصيل إلى ${esc(o.delivery_city)}: ${fmt(o.delivery_price)}</div>` : ''}
          ${o.discount ? `<div class="meta">خصم (${esc(o.coupon_code || '')}): -${fmt(o.discount)}</div>` : ''}
          <div class="my-order-total">الإجمالي: ${fmt(o.total)}</div>
        </div>`).join('');
    } catch (ex) {
      box.innerHTML = `<div class="empty">${esc(ex.message)}</div>`;
    }
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
      <button class="hbtn" id="btnMyOrders" type="button">طلباتي</button>
      ${u.role === 'admin' ? '<a class="hbtn" href="/admin">لوحة التحكم</a>' : ''}
      <button class="hbtn" id="btnLogout" type="button">تسجيل الخروج</button>`;
    $('#btnMyOrders').addEventListener('click', openMyOrders);
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
