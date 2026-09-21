(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);

  // الوجهة بعد الدخول (نسمح بالمسارات الداخلية فقط)
  const next = new URLSearchParams(location.search).get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

  async function post(url, body) {
    const res = await fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'حدث خطأ، حاول مرة أخرى');
    return data;
  }

  document.querySelectorAll('.tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
      $('#loginForm').hidden = b.dataset.tab !== 'login';
      $('#regForm').hidden = b.dataset.tab !== 'register';
    })
  );

  function handle(form, errBox, url, getBody) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      errBox.textContent = '';
      btn.disabled = true;
      try {
        await post(url, getBody());
        location.href = target;
      } catch (ex) {
        errBox.textContent = ex.message;
        btn.disabled = false;
      }
    });
  }

  handle($('#loginForm'), $('#lErr'), '/api/auth/login', () => ({
    email: $('#lEmail').value, password: $('#lPass').value,
  }));
  handle($('#regForm'), $('#rErr'), '/api/auth/register', () => ({
    username: $('#rName').value, phone: $('#rPhone').value, email: $('#rEmail').value, password: $('#rPass').value,
  }));
})();
