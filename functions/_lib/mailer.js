// functions/_lib/mailer.js
export async function sendEmail(env, { to, subject, text }) {
  if (env.DEV_DELIVERY === 'true') {
    // Деморежим: "отправка" в логи
    console.log({ demoMail: { to, subject, text } });
    return { ok: true, demo: true };
  }

  // Пример интеграции через HTTP API провайдера (псевдокод):
  // const res = await fetch('https://api.resend.com/emails', { method:'POST', headers:{ Authorization:`Bearer ${env.RESEND_API_KEY}`, 'content-type':'application/json' }, body: JSON.stringify({ from:'no-reply@yourdomain.com', to, subject, text }) });
  // if(!res.ok) throw new Error('Email send failed: '+await res.text());
  // return { ok:true };

  throw new Error('Email sender not configured. Set DEV_DELIVERY=true or configure a provider.');
}
