// functions/_middleware.js
export async function onRequest(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const path = url.pathname;

  // Открытые маршруты (логин, статика, auth-API, главная)
  const openExact = new Set([
    '/', '/index.html',
    '/login.html',
    '/api/auth/request-code',
    '/api/auth/verify-code',
    '/api/auth/logout',
  ]);

  const isOpen =
    openExact.has(path) ||
    path.startsWith('/assets/') ||      // CSS/JS
    path.startsWith('/favicon') ||      // фавиконки
    path.startsWith('/robots.txt') ||   // служебное
    path.startsWith('/_workers/') ||    // служебное
    path.startsWith('/.well-known/');   // служебное

  if (isOpen) {
    // важно: пропускаем дальше к статике/функциям
    return ctx.next();
  }

  // --- проверка сессии ---
  const cookies = parseCookie(request.headers.get('cookie') || '');
  const sid = cookies['sid'];
  if (!sid) return redirectToLogin(url);

  // верифицируем сессию
  const row = await env.edu_rppa_db
    .prepare('SELECT email, expires_at FROM sessions WHERE session_id = ?')
    .bind(sid).first();

  const now = Math.floor(Date.now()/1000);
  if (!row || row.expires_at < now) {
    return redirectToLogin(url);
  }

  // ок — даём продолжить
  return ctx.next();
}

function redirectToLogin(url) {
  const to = '/login.html?next=' + encodeURIComponent(url.pathname + url.search);
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
