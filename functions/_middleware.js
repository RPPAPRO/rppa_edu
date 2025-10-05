// functions/_middleware.js
export async function onRequest(ctx) {
  try {
    const { request, env } = ctx;
    const url = new URL(request.url);
    const path = url.pathname;

    // 1) Пропускаем preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    // 2) Явно разрешённые пути: главная, логин, статика, авторизация
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

    const isOpen =
      openExact.has(path) ||
      openPrefix.some(p => path.startsWith(p));

    // 3) Никогда не редиректим сам /login.html (во избежание петли)
    const isLogin = path === '/login.html';

    if (isOpen || isLogin) {
      return await ctx.next();
    }

    // 4) Проверяем сессию для всего остального (страницы и /api/*)
    const cookies = parseCookie(request.headers.get('cookie') || '');
    const sid = cookies['sid'];
    if (!sid) return redirectToLogin(url);

    if (!env.edu_rppa_db) {
      // Без привязки D1 не валимся, но считаем что нет сессии
      return redirectToLogin(url);
    }

    const row = await env.edu_rppa_db
      .prepare('SELECT email, expires_at FROM sessions WHERE session_id = ?')
      .bind(sid).first();

    const now = Math.floor(Date.now() / 1000);
    if (!row || row.expires_at < now) {
      return redirectToLogin(url);
    }

    // 5) Авторизовано — пропускаем дальше
    return await ctx.next();
  } catch (e) {
    console.log({ middleware_unhandled: String(e) });
    return new Response('Internal error (middleware)', { status: 500 });
  }
}

function redirectToLogin(currentUrl) {
  const loginUrl = new URL('/login.html', currentUrl.origin);
  // Если уже на /login.html — не редиректим (страхуемся от любых побочных эффектов)
  if (currentUrl.pathname === '/login.html') {
    return new Response(null, { status: 204 });
  }
  loginUrl.searchParams.set('next', currentUrl.pathname + currentUrl.search);
  return Response.redirect(loginUrl, 302);
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
