// functions/api/orders.js
import { log, json, doneMeta, safeJson } from "../_lib/logger.js";

export async function onRequest(ctx) {
  const { request } = ctx;
  const { method } = request;
  const t0 = performance.now();

  try {
    if (method !== "POST") {
      return json(ctx, { error: "Method Not Allowed" }, 405);
    }

    const authed = await getCurrentUser(ctx);
    if (!authed) return json(ctx, { error: "unauthorized" }, 401);
    const { user_id } = authed;

    const body = await safeJson(request);
    log(ctx, "info", "orders.post.body", { body });

    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return json(ctx, { error: "items required" }, 400, doneMeta(t0));

    // Нормализуем и валидируем вход
    const wanted = [];
    const seen = new Set();
    for (const it of items) {
      const pid = Number(it?.product_id);
      const qty = Number(it?.qty);
      if (!Number.isInteger(pid) || !Number.isInteger(qty) || qty <= 0) {
        return json(ctx, { error: "invalid items: product_id integer, qty positive integer" }, 400, doneMeta(t0));
      }
      if (!seen.has(pid)) {
        seen.add(pid);
        wanted.push({ product_id: pid, qty });
      } else {
        // если пришли дубли — суммируем
        const found = wanted.find(x => x.product_id === pid);
        found.qty += qty;
      }
    }

    // Загружаем товары
    const ids = wanted.map(w => w.product_id);
    const placeholders = ids.map(() => '?').join(',');
    const db = ctx.env.edu_rppa_db;

    const { results: foundProducts } = await db
      .prepare(`SELECT id, name, price_cents FROM products WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all();

    // Проверим, что все товары найдены
    const foundIds = new Set((foundProducts || []).map(p => p.id));
    const missing = ids.filter(id => !foundIds.has(id));
    if (missing.length) {
      return json(ctx, { error: `products not found: ${missing.join(',')}` }, 400, doneMeta(t0));
    }

    // Собираем карту позиций и тотал
    const prodMap = Object.fromEntries(foundProducts.map(p => [p.id, p]));
    const items_map = {};
    let total_cents = 0;

    for (const it of wanted) {
      const p = prodMap[it.product_id];
      const price = Number(p.price_cents) || 0;
      const line = price * it.qty;
      total_cents += line;
      items_map[String(it.product_id)] = {
        qty: it.qty,
        price_cents: price,
        line_total_cents: line,
        name: p.name
      };
    }

    // Сохраняем заказ
    const order_id = Date.now();
    const created_at = new Date().toISOString();

    await db
      .prepare(`INSERT INTO orders (id, user_id, items_json, total_cents, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(order_id, user_id, JSON.stringify(items_map), total_cents, created_at)
      .run();

    return json(ctx, {
      ok: true,
      order: {
        id: order_id,
        user_id,
        total_cents,
        created_at,
        items_map
      }
    }, 201, doneMeta(t0));

  } catch (e) {
    log(ctx, "error", "orders.unhandled", { error: String(e) });
    return json(ctx, { error: String(e) }, 500, doneMeta(t0));
  }
}

// ----- helpers -----
async function getCurrentUser(ctx) {
  const { request, env } = ctx;
  const cookies = parseCookie(request.headers.get('cookie') || '');
  const sid = cookies['sid'];
  if (!sid) return null;

  const session = await env.edu_rppa_db
    .prepare('SELECT email, expires_at FROM sessions WHERE session_id = ?')
    .bind(sid).first();

  const now = Math.floor(Date.now()/1000);
  if (!session || session.expires_at < now) return null;

  const user = await env.edu_rppa_db
    .prepare('SELECT id, name FROM users WHERE email = ? LIMIT 1')
    .bind(session.email).first();

  if (!user) return null;
  return { user_id: user.id, email: session.email, name: user.name };
}

function parseCookie(str){
  const out={}; if(!str) return out;
  str.split(';').forEach(p=>{ const i=p.indexOf('='); if(i>0) out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1)); });
  return out;
}
