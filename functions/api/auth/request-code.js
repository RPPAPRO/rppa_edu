import { json } from "../../_lib/logger.js";
import { sendEmail } from "../../_lib/mailer.js";

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const body = await safeJson(request);
  const email = String(body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return json(ctx, { error: 'valid email required' }, 400);

  const code = genCode();
  const codeHash = await sha256(code);
  const now = Math.floor(Date.now()/1000);
  const ttl = 10 * 60; // 10 минут

  await env.edu_rppa_db.prepare(
    "INSERT INTO auth_codes(email, code_hash, expires_at, created_at) VALUES(?,?,?,?)"
  ).bind(email, codeHash, now + ttl, now).run();

  // отправляем
  const text = `Your verification code: ${code}\nIt expires in 10 minutes.`;
  try {
    await sendEmail(env, { to: email, subject: 'Your login code', text });
  } catch (e) {
    return json(ctx, { error: String(e) }, 500);
  }

  // В демо-режиме можно вернуть code, чтобы показать аудитории (или вывести в лог)
  const dev = env.DEV_DELIVERY === 'true' ? { demo_code: code } : {};
  return json(ctx, { ok: true, ...dev }, 200);
}

async function safeJson(req){
  const ct = req.headers.get('content-type') || '';
  if(!ct.includes('application/json')) return {};
  const t = await req.text(); return t ? JSON.parse(t) : {};
}
function genCode(){ return String(Math.floor(100000 + Math.random()*900000)); } // 6 цифр
async function sha256(s){
  const b = new TextEncoder().encode(s);
  const d = await crypto.subtle.digest('SHA-256', b);
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
