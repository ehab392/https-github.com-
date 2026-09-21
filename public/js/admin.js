(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const S = { products: [], orders: [], filter: 'all', currency: 'ر.س', form: null };
  const fmt = (n) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${S.currency}`;
  const STATUS = { new: 'جديد', confirmed: 'مؤكد', shipped: 'تم الشحن', done: 'مكتمل', cancelled: 'ملغي' };

  async function api(url, opts = {}) {
    const isForm = opts.body instanceof FormData;
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: isForm ? {} : { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body && !isForm ? JSON.stringify(opts.body) : opts.body,
    });
    if (res.status === 401 || res.status === 403) { location.href = '/login.html?next=/admin'; throw new Error('غير مصرّح'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'حدث خطأ، حاول مرة أخرى');
    return data;
  }

  function toast(msg, isError = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    $('#toastBox').appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  const hasDiscount = (p) =>
    p.type === 'perfume' ? p.old_price > p.price : p.variants.some((v) => v.old_price > v.price);
  const firstImage = (p) => (p.type === 'perfume' ? p.images[0] : (p.variants.find((v) => v.image) || {}).image) || '';

  // ---------- التبويبات ----------
  function showTab(name) {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    ['products', 'form', 'orders'].forEach((t) => { $('#tab-' + t).hidden = t !== name; });
    if (name === 'orders') loadOrders();
    if (name === 'products') loadProducts();
    if (name === 'form' && !S.form) newForm('perfume');
    if (!S.form) $('#tabForm').textContent = 'إضافة منتج';
  }
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    showTab(b.dataset.tab);
  });
  $('#logout').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    location.href = '/';
  });

  // ---------- قائمة المنتجات ----------
  async function loadProducts() {
    try {
      S.products = (await api('/api/admin/products')).products;
      renderProducts();
    } catch (e) { $('#productList').innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
  }

  function priceText(p) {
    if (p.type === 'perfume') {
      return p.old_price > p.price ? `${fmt(p.price)}<span class="old">${fmt(p.old_price)}</span>` : fmt(p.price);
    }
    return p.variants.map((v) =>
      `${esc(v.size)}: ${fmt(v.price)}${v.old_price > v.price ? `<span class="old">${fmt(v.old_price)}</span>` : ''}`
    ).join(' &nbsp;|&nbsp; ');
  }

  function renderProducts() {
    let list = S.products;
    if (S.filter === 'incense' || S.filter === 'perfume') list = list.filter((p) => p.type === S.filter);
    if (S.filter === 'offers') list = list.filter(hasDiscount);
    const box = $('#productList');
    if (!list.length) {
      box.innerHTML = '<p class="empty">لا توجد منتجات هنا. اضغط على تبويب "إضافة منتج" لإضافة أول منتج.</p>';
      return;
    }
    box.innerHTML = list.map((p) => `
      <div class="prow" data-id="${p.id}">
        ${firstImage(p) ? `<img class="thumb" src="${esc(firstImage(p))}" alt="">` : '<div class="thumb"></div>'}
        <div>
          <h3>${esc(p.name)}</h3>
          <div class="meta">${p.type === 'incense' ? 'بخور' : 'عطر'}
            ${p.is_best_seller ? ' · ⭐ من الأكثر مبيعًا' : ''}${hasDiscount(p) ? ' · 🏷️ عليه خصم' : ''}</div>
          <div class="meta">${priceText(p)}</div>
          <div class="btns">
            <button class="btn btn-sm" data-act="edit" type="button">تعديل</button>
            <button class="btn btn-sm btn-brass" data-act="best" type="button">${p.is_best_seller ? 'إزالة من الأكثر مبيعًا' : 'إضافة إلى الأكثر مبيعًا'}</button>
            <button class="btn btn-sm btn-danger" data-act="del" type="button">حذف</button>
          </div>
        </div>
      </div>`).join('');
  }

  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-f]');
    if (!b) return;
    S.filter = b.dataset.f;
    document.querySelectorAll('#filters button').forEach((x) => x.classList.toggle('active', x === b));
    renderProducts();
  });

  $('#productList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = Number(btn.closest('.prow').dataset.id);
    const p = S.products.find((x) => x.id === id);
    try {
      if (btn.dataset.act === 'edit') { editForm(p); showTab('form'); }
      if (btn.dataset.act === 'best') {
        await api(`/api/admin/products/${id}/bestseller`, { method: 'PATCH', body: { value: !p.is_best_seller } });
        toast(p.is_best_seller ? 'تمت الإزالة من الأكثر مبيعًا' : 'تمت الإضافة إلى الأكثر مبيعًا');
        loadProducts();
      }
      if (btn.dataset.act === 'del' && confirm(`هل تريد حذف "${p.name}" نهائيًا؟`)) {
        await api(`/api/admin/products/${id}`, { method: 'DELETE' });
        toast('تم حذف المنتج');
        loadProducts();
      }
    } catch (ex) { toast(ex.message, true); }
  });

  // ---------- نموذج المنتج ----------
  const emptyVariant = () => ({ size: '', price: '', discount: '', image: '' });

  function newForm(type, keep = false) {
    if (keep && S.form) return;
    S.form = { id: null, type, name: '', price: '', discount: '', images: [], variants: [emptyVariant()] };
    renderForm();
  }
  function editForm(p) {
    const f = { id: p.id, type: p.type, name: p.name, price: '', discount: '', images: [], variants: [emptyVariant()] };
    if (p.type === 'perfume') {
      f.price = p.old_price > p.price ? p.old_price : p.price;
      f.discount = p.old_price > p.price ? p.price : '';
      f.images = [...p.images];
    } else {
      f.variants = p.variants.map((v) => ({
        size: v.size,
        price: v.old_price > v.price ? v.old_price : v.price,
        discount: v.old_price > v.price ? v.price : '',
        image: v.image || '',
      }));
    }
    S.form = f;
    renderForm();
  }

  function imgPreview(url) {
    return url ? `<img src="${esc(url)}" alt="">` : '<div class="empty-img">بدون صورة</div>';
  }

  function renderForm() {
    const f = S.form;
    $('#tabForm').textContent = f.id ? 'تعديل منتج' : 'إضافة منتج';
    const perfume = `
      <div class="two">
        <div class="field"><label for="f-price">السعر (${esc(S.currency)})</label>
          <input id="f-price" data-f="price" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(f.price)}"></div>
        <div class="field"><label for="f-disc">سعر جديد بعد الخصم (اختياري)</label>
          <input id="f-disc" data-f="discount" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(f.discount)}"></div>
      </div>
      <p class="hint">عند إدخال سعر الخصم يظهر السعر القديم مشطوبًا والجديد بجانبه، ويظهر المنتج في قسم العروض تلقائيًا. اترك الخانة فارغة لإلغاء الخصم.</p>
      <div class="field"><label>الصورة الرئيسية</label>
        <div class="imgbox">${imgPreview(f.images[0])}
          <span class="btn btn-ghost filebtn">${f.images[0] ? 'تغيير الصورة' : 'اختيار صورة'}<input type="file" accept="image/*" data-up="main"></span>
        </div></div>
      <div class="field"><label>صور إضافية</label>
        <div class="extras">
          ${f.images.slice(1).map((u, i) => `<div class="extra"><img src="${esc(u)}" alt=""><button type="button" data-act="rmimg" data-i="${i + 1}" aria-label="حذف الصورة">×</button></div>`).join('')}
        </div>
        <div><span class="btn btn-ghost filebtn">+ إضافة صورة أخرى<input type="file" accept="image/*" data-up="extra"></span></div>
      </div>`;

    const incense = `
      ${f.variants.map((v, i) => `
        <div class="variant">
          <div class="variant-head"><span>الحجم ${i + 1}</span>
            ${f.variants.length > 1 ? `<button class="btn btn-sm btn-danger" type="button" data-act="rmvar" data-i="${i}">حذف</button>` : ''}</div>
          <div class="field"><label>الحجم (مثال: 50 جم)</label>
            <input data-vf="size" data-i="${i}" value="${esc(v.size)}"></div>
          <div class="two">
            <div class="field"><label>السعر (${esc(S.currency)})</label>
              <input data-vf="price" data-i="${i}" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(v.price)}"></div>
            <div class="field"><label>سعر بعد الخصم (اختياري)</label>
              <input data-vf="discount" data-i="${i}" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(v.discount)}"></div>
          </div>
          <div class="field"><label>صورة هذا الحجم</label>
            <div class="imgbox">${imgPreview(v.image)}
              <span class="btn btn-ghost filebtn">${v.image ? 'تغيير الصورة' : 'اختيار صورة'}<input type="file" accept="image/*" data-up="variant" data-i="${i}"></span>
            </div></div>
        </div>`).join('')}
      <button class="btn btn-ghost" type="button" data-act="addvar">+ إضافة حجم آخر</button>
      <p class="hint">الخصم يُطبَّق على الحجم الذي تدخل له سعرًا جديدًا فقط.</p>`;

    $('#productForm').innerHTML = `
      <h2>${f.id ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h2>
      <div class="field"><label>نوع المنتج</label>
        <div class="type-pick">
          <button type="button" data-type="incense" class="${f.type === 'incense' ? 'on' : ''}" ${f.id ? 'disabled' : ''}>🪔 بخور</button>
          <button type="button" data-type="perfume" class="${f.type === 'perfume' ? 'on' : ''}" ${f.id ? 'disabled' : ''}>🌸 عطر</button>
        </div></div>
      <div class="field"><label for="f-name">${f.type === 'incense' ? 'اسم البخور' : 'اسم العطر'}</label>
        <input id="f-name" data-f="name" value="${esc(f.name)}"></div>
      ${f.type === 'perfume' ? perfume : incense}
      <p class="form-error" id="formErr" role="alert"></p>
      <div class="form-actions">
        <button class="btn btn-brass" type="submit" id="saveBtn">${f.id ? 'حفظ التعديلات' : 'إضافة المنتج'}</button>
        <button class="btn btn-ghost" type="button" data-act="cancel">إلغاء</button>
      </div>`;
  }

  const form = $('#productForm');

  // مزامنة الحقول مع الحالة أثناء الكتابة (بدون إعادة رسم)
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.f) S.form[t.dataset.f] = t.value;
    if (t.dataset.vf) S.form.variants[Number(t.dataset.i)][t.dataset.vf] = t.value;
  });

  form.addEventListener('click', (e) => {
    const typeBtn = e.target.closest('button[data-type]');
    if (typeBtn && !S.form.id) { S.form.type = typeBtn.dataset.type; renderForm(); return; }
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const i = Number(b.dataset.i);
    if (b.dataset.act === 'addvar') { S.form.variants.push(emptyVariant()); renderForm(); }
    if (b.dataset.act === 'rmvar') { S.form.variants.splice(i, 1); renderForm(); }
    if (b.dataset.act === 'rmimg') { S.form.images.splice(i, 1); renderForm(); }
    if (b.dataset.act === 'cancel') { S.form = null; showTab('products'); }
  });

  // رفع الصور فور اختيارها
  form.addEventListener('change', async (e) => {
    const input = e.target;
    if (!input.dataset.up || !input.files.length) return;
    const fd = new FormData();
    fd.append('image', input.files[0]);
    toast('جارٍ رفع الصورة…');
    try {
      const { url } = await api('/api/admin/upload', { method: 'POST', body: fd });
      const f = S.form;
      if (input.dataset.up === 'main') f.images[0] = url;
      if (input.dataset.up === 'extra') { if (!f.images.length) f.images[0] = url; else f.images.push(url); }
      if (input.dataset.up === 'variant') f.variants[Number(input.dataset.i)].image = url;
      renderForm();
      toast('تم رفع الصورة');
    } catch (ex) { toast(ex.message, true); }
  });

  function buildPayload() {
    const f = S.form;
    const name = f.name.trim();
    if (!name) throw new Error('اكتب اسم المنتج');
    const price = (orig, disc, label) => {
      const o = Number(orig);
      if (!(o > 0)) throw new Error(`أدخل سعرًا صحيحًا ${label}`);
      if (disc === '' || disc === null) return { price: o, old_price: null };
      const d = Number(disc);
      if (!(d > 0 && d < o)) throw new Error(`سعر الخصم ${label} يجب أن يكون أقل من السعر الأصلي`);
      return { price: d, old_price: o };
    };
    if (f.type === 'perfume') {
      return { type: 'perfume', name, ...price(f.price, f.discount, ''), images: f.images };
    }
    return {
      type: 'incense', name,
      variants: f.variants.map((v, i) => {
        if (!v.size.trim()) throw new Error(`اكتب اسم الحجم رقم ${i + 1}`);
        return { size: v.size.trim(), image: v.image, ...price(v.price, v.discount, `للحجم "${v.size}"`) };
      }),
    };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#formErr');
    err.textContent = '';
    const btn = $('#saveBtn');
    try {
      const body = buildPayload();
      btn.disabled = true;
      const id = S.form.id;
      await api(id ? `/api/admin/products/${id}` : '/api/admin/products', { method: id ? 'PUT' : 'POST', body });
      toast(id ? 'تم حفظ التعديلات' : 'تمت إضافة المنتج');
      S.form = null;
      showTab('products');
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
      err.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // ---------- الطلبات ----------
  async function loadOrders() {
    const box = $('#orderList');
    try {
      S.orders = (await api('/api/admin/orders')).orders;
      if (!S.orders.length) { box.innerHTML = '<p class="empty">لا توجد طلبات بعد.</p>'; return; }
      box.innerHTML = S.orders.map((o) => `
        <div class="order" data-id="${o.id}">
          <div class="order-head">
            <strong>طلب رقم ${o.id}</strong>
            <span class="meta">${new Date(o.created_at).toLocaleString('ar-EG')}</span>
          </div>
          <div>👤 ${esc(o.customer_name)} &nbsp;|&nbsp; 📞 <a href="tel:${esc(o.phone)}" dir="ltr">${esc(o.phone)}</a></div>
          <ul>${o.items.map((i) => `<li>${esc(i.name)} × ${i.quantity} — ${fmt(i.price * i.quantity)}</li>`).join('')}</ul>
          <div class="order-head">
            <span class="total">المجموع: ${fmt(o.total)}</span>
            <select data-status aria-label="حالة الطلب">
              ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
        </div>`).join('');
    } catch (e) { box.innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
  }

  $('#orderList').addEventListener('change', async (e) => {
    const sel = e.target.closest('select[data-status]');
    if (!sel) return;
    try {
      await api(`/api/admin/orders/${sel.closest('.order').dataset.id}/status`, { method: 'PATCH', body: { status: sel.value } });
      toast('تم تحديث حالة الطلب');
    } catch (ex) { toast(ex.message, true); }
  });

  // ---------- البدء ----------
  (async () => {
    try { S.currency = (await api('/api/config')).currency; } catch (_) {}
    loadProducts();
  })();
})();
