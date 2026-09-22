const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * يرسل بريدًا إلكترونيًا للأدمن عند وصول طلب جديد، عبر خدمة Resend.
 * لا يفعل شيئًا إن لم تُضبط RESEND_API_KEY و ADMIN_NOTIFY_EMAIL (لا يوقف الموقع أبدًا).
 */
async function notifyNewOrder(order) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!apiKey || !to) return;

  const rows = order.items
    .map((i) => `<tr><td style="padding:4px 8px">${esc(i.name)}</td><td style="padding:4px 8px">${i.quantity}</td><td style="padding:4px 8px">${(i.price * i.quantity).toFixed(2)}</td></tr>`)
    .join('');

  const html = `
    <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;text-align:right;max-width:480px;margin:auto">
      <h2 style="color:#4a1420">🔔 طلب جديد رقم ${order.id} — حجة بتول</h2>
      <p><b>اسم العميل:</b> ${esc(order.customer_name)}</p>
      <p><b>رقم الهاتف:</b> <a href="tel:${esc(order.phone)}">${esc(order.phone)}</a></p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2dcd3">
        <tr style="background:#f1efec"><th style="padding:4px 8px">المنتج</th><th style="padding:4px 8px">الكمية</th><th style="padding:4px 8px">السعر</th></tr>
        ${rows}
      </table>
      <p style="font-size:18px;font-weight:bold;margin-top:10px">المجموع: ${order.total}</p>
      <p style="color:#7a6d6f;font-size:13px">افتح لوحة التحكم في موقعك لمتابعة الطلب.</p>
    </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Hujjat Batool <onboarding@resend.dev>',
        to: [to],
        subject: `🔔 طلب جديد رقم ${order.id} - حجة بتول`,
        html,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('فشل إرسال إشعار البريد:', res.status, text);
    }
  } catch (e) {
    console.error('فشل إرسال إشعار البريد:', e.message);
  }
}

module.exports = { notifyNewOrder };
