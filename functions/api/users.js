// functions/api/users.js


function meta(ctx) {
  const req = ctx.request;
  const h = req.headers;
  const url = new URL(req.url);
  return {
    ts: new Date().toISOString(),
    method: req.method,
    path: url.pathname + url.search,
    ray: h.get("cf-ray") || h.get("x-request-id") || null,
    ip: h.get("cf-connecting-ip") || null,
    ua: h.get("user-agent") || null,
  };
}

function log(ctx, level, event, extra) {
  const base = meta(ctx);
  const payload = { ...base, level, event };
  if (extra && Object.keys(extra).length) payload.extra = extra;
  // ВАЖНО: передаём объект, НЕ строку → Cloudflare покажет JSON нормально
  console.log(payload);
}

function json(ctx, data, status = 200, extraMeta = {}) {
  log(ctx, status >= 400 ? "error" : "info", "response", {
    status,
    dataPreview: preview(data), // объект, не строка
    ...extraMeta,
  });
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function preview(obj, max = 800) {
  try {
    const s = JSON.stringify(obj);
    if (s.length > max) return { truncated: true, slice: JSON.parse(s.slice(0, max)) };
    return obj;
  } catch {
    return { note: "unserializable" };
  }
}

// Безопасный парс тела (на случай пустого тела/не-JSON)
async function safeJson(request) {
  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return {};
  const text = await request.text();
  if (!text) return {};
  return JSON.parse(text);
}

export async function onRequest(ctx) {
  const db = ctx.env.edu_rppa_db;
  const { request } = ctx;
  const { method } = request;
  const url = new URL(request.url);

  const t0 = performance.now();
  log(ctx, "info", "request.start", { method, path: url.pathname + url.search });

  try {
    // -------- GET --------
    // /api/users            -> список всех
    // /api/users?id=123     -> один по id
    if (method === "GET") {
      const idParam = url.searchParams.get("id");

      if (idParam) {
        const id = Number(idParam);
        if (!Number.isInteger(id)) return json(ctx, { error: "id must be integer" }, 400);
        log(ctx, "info", "get.byId", { id });

        const row = await db
          .prepare("SELECT id, name, email, created_at FROM users WHERE id = ?")
          .bind(id)
          .first();

        return json(ctx, { user: row ?? null }, 200, doneMeta(t0));
      }

      log(ctx, "info", "get.list", {});
      const { results } = await db
        .prepare("SELECT id, name, email, created_at FROM users ORDER BY id DESC")
        .all();

      return json(ctx, { users: results ?? [] }, 200, { count: (results || []).length, ...doneMeta(t0) });
    }

    // -------- POST --------
    // body: { name, email }
    if (method === "POST") {
      const body = await safeJson(request);
      log(ctx, "info", "post.body", { body: preview(body) });

      const name = String(body?.name ?? "").trim();
      const email = String(body?.email ?? "").trim();
      if (!name || !email) return json(ctx, { error: "name and email are required" }, 400, doneMeta(t0));

      const id = Date.now(); // INTEGER для твоей схемы
      const createdAt = new Date().toISOString();

      try {
        const res = await db
          .prepare("INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)")
          .bind(id, name, email, createdAt)
          .run();
        log(ctx, "info", "post.db.insert", { changes: res?.meta?.changes ?? null, id });
      } catch (e) {
        const es = String(e);
        log(ctx, "error", "post.db.error", { error: es });
        if (es.includes("UNIQUE")) return json(ctx, { error: "email already exists" }, 409, doneMeta(t0));
        throw e;
      }

      return json(ctx, { ok: true, id }, 201, doneMeta(t0));
    }

    // -------- PUT --------
    // body: { id, name?, email? }
    if (method === "PUT") {
      const body = await safeJson(request);
      log(ctx, "info", "put.body", { body: preview(body) });

      const id = Number(body?.id);
      if (!Number.isInteger(id)) return json(ctx, { error: "id must be integer" }, 400, doneMeta(t0));

      const name = body?.name != null ? String(body.name).trim() : undefined;
      const email = body?.email != null ? String(body.email).trim() : undefined;

      if (name == null && email == null) {
        return json(ctx, { error: "nothing to update" }, 400, doneMeta(t0));
      }

      const fields = [];
      const binds = [];
      if (name != null && name !== "") { fields.push("name = ?"); binds.push(name); }
      if (email != null && email !== "") { fields.push("email = ?"); binds.push(email); }
      if (fields.length === 0) return json(ctx, { error: "invalid values" }, 400, doneMeta(t0));

      binds.push(id);
      try {
        const res = await db
          .prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`)
          .bind(...binds)
          .run();
        log(ctx, "info", "put.db.update", { changes: res?.meta?.changes ?? null, id });
        if (res.meta.changes === 0) return json(ctx, { error: "not found" }, 404, doneMeta(t0));
      } catch (e) {
        const es = String(e);
        log(ctx, "error", "put.db.error", { error: es });
        if (es.includes("UNIQUE")) return json(ctx, { error: "email already exists" }, 409, doneMeta(t0));
        throw e;
      }

      return json(ctx, { ok: true }, 200, doneMeta(t0));
    }

    // -------- DELETE --------
    // /api/users?id=123  ИЛИ body: { id }
    if (method === "DELETE") {
      const qId = url.searchParams.get("id");
      const body = await safeJson(request).catch(() => ({}));
      const idRaw = qId ?? body?.id;
      const id = Number(idRaw);
      log(ctx, "info", "delete.input", { id: idRaw });

      if (!Number.isInteger(id)) return json(ctx, { error: "id must be integer" }, 400, doneMeta(t0));

      const res = await db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
      log(ctx, "info", "delete.db.delete", { changes: res?.meta?.changes ?? null, id });
      if (res.meta.changes === 0) return json(ctx, { error: "not found" }, 404, doneMeta(t0));

      return json(ctx, { ok: true }, 200, doneMeta(t0));
    }

    return json(ctx, { error: "Method Not Allowed" }, 405, doneMeta(t0));
  } catch (e) {
    log(ctx, "error", "unhandled.error", { error: String(e) });
    return json(ctx, { error: String(e) }, 500, doneMeta(t0));
  }
}

function doneMeta(t0) {
  return { duration_ms: Math.round(performance.now() - t0) };
}
