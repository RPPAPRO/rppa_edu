// functions/_middleware.js
export async function onRequest(ctx) {
  try {
    const { request, env } = ctx;
    const url = new URL(request.url);
    const path = url.pathname;

    // Открытые маршруты (старт/логин/статик/авторизация)
    const openExact = new Set([
      '/', '/index.html',
      '/login.html',
      '/api/auth/request-code',
      '/api/auth/verify-code',
      '/api/auth/logout',
    ]);
    const openPrefix = [
      '/assets/', '/favicon', '/robots.txt',
      '/_workers/', '/.well-known/',
    ];

    // Пропускаем OPTIONS без проверки сессии (preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    const isOpen =
      openExact.has(path) ||
      openPrefix.some(p => path.startsWith(p));

    if (isOpen) {
      // Важно: именно await
      return await ctx.next();
    }

    // --- проверка сессии ---
    const cookies = parseCookie(request.headers.get('cookie') || '');
    const sid = cookies['sid'];
    if (!sid) return redirectToLogin(url);

    // D1 может быть не привязан — не роняем воркер
    if (!env.edu_rppa_db) {
      console.log({ middleware_error: 'D1 binding is undefined' });
      return redirectToLogin(url);
    }

    const row = await env.edu_rppa_db
      .prepare('SELECT email, expires_at FROM sessions WHERE session_id = ?')
      .bind(sid).first();

    const now = Math.floor(Date.now() / 1000);
    if (!row || row.expires_at < now) {
      return redirectToLogin(url);
    }

    // Авторизовано → пропускаем к статике/функциям
    return await ctx.next();
  } catch (e) {
    // Никогда не оставляем без ответа — лог и 500
    console.log({ middleware_unhandled: String(e) });
    return new Response('Internal error (middleware)', { status: 500 });
  }
}

function redirectToLogin(url) {
  const login = new URL('/login.html', url.origin);
  login.searchParams.set('next', url.pathname + url.search);
  return Response.redirect(login, 302);
}

function parseCookie(str) {
  const out = {};
  if (!str) return out;
  str.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1));
  });
  return out;
}
