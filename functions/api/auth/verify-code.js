import { json } from "../../_lib/logger.js";

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const body = await safeJson(request);
  const email = String(body?.email || '').trim().toLowerCase();
  const code  = String(body?.code || '').trim();

  if (!email || !code) return json(ctx, { error: 'email and code required' }, 400);

  const codeHash = await sha256(code);
  const now = Math.floor(Date.now()/1000);

  const row = await env.edu_rppa_db.prepare(
    "SELECT email, expires_at FROM auth_codes WHERE email=? AND code_hash=? ORDER BY created_at DESC LIMIT 1"
  ).bind(email, codeHash).first();

  if (!row || row.expires_at < now) return json(ctx, { error: 'invalid or expired code' }, 400);

  // создаём сессию на, например, 7 дней
  const sid = cryptoRandom(32);
  const exp = now + 7*24*60*60;
  await env.edu_rppa_db.prepare(
    "INSERT INTO sessions(session_id, email, expires_at, created_at) VALUES(?,?,?,?)"
  ).bind(sid, email, exp, now).run();

  // cookie
  const headers = new Headers({
    'content-type': 'application/json',
    'set-cookie': cookie('sid', sid, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 7*24*60*60 })
  });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

async function safeJson(req){
  const ct = req.headers.get('content-type') || '';
  if(!ct.includes('application/json')) return {};
  const t = await req.text(); return t ? JSON.parse(t) : {};
}
async function sha256(s){
  const b = new TextEncoder().encode(s);
  const d = await crypto.subtle.digest('SHA-256', b);
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function cryptoRandom(n){
  const b = new Uint8Array(n); crypto.getRandomValues(b);
  return [...b].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function cookie(name, value, { httpOnly, secure, sameSite, path, maxAge }={}){
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (path) parts.push(`Path=${path}`);
  if (maxAge) parts.push(`Max-Age=${maxAge}`);
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  if (secure) parts.push('Secure');
  if (httpOnly) parts.push('HttpOnly');
  return parts.join('; ');
}
