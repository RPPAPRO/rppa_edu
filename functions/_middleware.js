// functions/_middleware.js
export async function onRequest(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);

  // Открытые маршруты:
  const open = [
    '/', '/index.html',
    '/login.html',
    '/assets/app.css', '/assets/app.js',
    '/api/auth/request-code', '/api/auth/verify-code', '/api/auth/logout'
  ];
  if (open.some(p => url.pathname === p)) return;

  // Проверяем cookie sid
  const sid = parseCookie(request.headers.get('cookie') || '')['sid'];
  if (!sid) return redirectToLogin(url);

  // Верифицируем сессию в D1
  const row = await env.edu_rppa_db
    .prepare('SELECT email, expires_at FROM sessions WHERE session_id = ?')
    .bind(sid).first();

  const now = Math.floor(Date.now()/1000);
  if (!row || row.expires_at < now) {
    return redirectToLogin(url);
  }

  // всё ок — пропускаем дальше
}

function redirectToLogin(url) {
  const to = '/login.html?next=' + encodeURIComponent(url.pathname);
  return Response.redirect(to, 302);
}

function parseCookie(str) {
  const out = {};
  str.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i>0) out[p.slice(0,i).trim()] = decodeURIComponent(p.slice(i+1));
  });
  return out;
}