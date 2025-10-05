import { json } from "../../_lib/logger.js";

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const cookies = parseCookie(request.headers.get('cookie') || '');
  const sid = cookies['sid'];

  if (sid) {
    await env.edu_rppa_db.prepare("DELETE FROM sessions WHERE session_id=?").bind(sid).run();
  }

  // Чистим cookie
  const headers = new Headers({
    'content-type':'application/json',
    'set-cookie':'sid=deleted; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
  });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

function parseCookie(str){
  const out={}; str.split(';').forEach(p=>{ const i=p.indexOf('='); if(i>0) out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1)); });
  return out;
}
