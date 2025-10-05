// functions/api/auth/logout.js
import { json } from "../../_lib/logger.js";

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const cookies = parseCookie(request.headers.get('cookie') || '');
  const sid = cookies['sid'];

  if (sid) {
    try { await env.edu_rppa_db.prepare("DELETE FROM sessions WHERE session_id=?").bind(sid).run(); }
    catch {}
  }

  // Чистим обе cookies отдельными заголовками
  const headers = new Headers({ 'content-type':'application/json' });
  headers.append('Set-Cookie', 'sid=deleted; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  headers.append('Set-Cookie', 'u=deleted; Path=/; Max-Age=0; SameSite=Lax');

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

function parseCookie(str){
  const out={}; if(!str) return out;
  str.split(';').forEach(p=>{ const i=p.indexOf('='); if(i>0) out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1)); });
  return out;
}
