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

  const state = { config: { currency: 'ر.س', whatsapp: '' }, user: null, category: 'all', q: '', products: [], cart: [] };
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
