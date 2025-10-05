// functions/api/auth/request-code.js
import { json } from "../../_lib/logger.js";
import { sendEmail } from "../../_lib/mailer.js";

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const body = await safeJson(request);

  const email = String(body?.email || '').trim().toLowerCase();
  const nameRaw = body?.name != null ? String(body.name).trim() : '';
  if (!email || !email.includes('@')) return json(ctx, { error: 'valid email required' }, 400);

  // ensure user exists (register-on-demand)
  try {
    const existing = await env.edu_rppa_db
      .prepare("SELECT id, name FROM users WHERE email = ? LIMIT 1")
      .bind(email).first();

    if (!existing) {
      const id = Date.now();
      const createdAt = new Date().toISOString();
      const name = nameRaw || deriveNameFromEmail(email);
      await env.edu_rppa_db
        .prepare("INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)")
        .bind(id, name, email, createdAt)
        .run();
    }
  } catch (e) {
    return json(ctx, { error: 'db error: ' + String(e) }, 500);
  }

  // generate code
  const code = genCode();
  const codeHash = await sha256(code);
  const now = Math.floor(Date.now()/1000);
  const ttl = 10 * 60; // 10 min

  try {
    await env.edu_rppa_db.prepare(
      "INSERT INTO auth_codes(email, code_hash, expires_at, created_at) VALUES(?,?,?,?)"
    ).bind(email, codeHash, now + ttl, now).run();
  } catch (e) {
    return json(ctx, { error: 'db error: ' + String(e) }, 500);
  }

  // send mail (or demo)
  const text = `Your verification code: ${code}\nIt expires in 10 minutes.`;
  try {
    await sendEmail(env, { to: email, subject: 'Your login code', text });
  } catch (e) {
    return json(ctx, { error: String(e) }, 500);
  }

  const dev = env.DEV_DELIVERY === 'true' ? { demo_code: code } : {};
  return json(ctx, { ok: true, ...dev }, 200);
}

async function safeJson(req){
  const ct = req.headers.get('content-type') || '';
  if(!ct.includes('application/json')) return {};
  const t = await req.text(); return t ? JSON.parse(t) : {};
}
function genCode(){ return String(Math.floor(100000 + Math.random()*900000)); }
function deriveNameFromEmail(email){
  const local = email.split('@')[0] || '';
  if (!local) return 'User';
  return local.replace(/[._-]+/g,' ').replace(/\b\w/g, c=>c.toUpperCase());
}
async function sha256(s){
  const b = new TextEncoder().encode(s);
  const d = await crypto.subtle.digest('SHA-256', b);
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
