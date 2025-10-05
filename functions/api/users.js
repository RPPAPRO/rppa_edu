import { log, json, doneMeta, safeJson } from "../_lib/logger.js";

export async function onRequest(ctx) {
  const db = ctx.env.edu_rppa_db;
  const { request } = ctx;
  const { method } = request;
  const url = new URL(request.url);

  const t0 = performance.now();
  log(ctx, "info", "request.start", { method, path: url.pathname + url.search });

  try {
    // -------- GET --------
    if (method === "GET") {
      const idParam = url.searchParams.get("id");

      if (idParam) {
        const id = Number(idParam);
        if (!Number.isInteger(id)) return json(ctx, { error: "id must be integer" }, 400);
        log(ctx, "info", "users.get.byId", { id });

        const row = await db
          .prepare("SELECT id, name, email, created_at FROM users WHERE id = ?")
          .bind(id)
          .first();

        return json(ctx, { user: row ?? null }, 200, doneMeta(t0));
      }

      log(ctx, "info", "users.get.list", {});
      const { results } = await db
        .prepare("SELECT id, name, email, created_at FROM users ORDER BY id DESC")
        .all();

      return json(ctx, { users: results ?? [] }, 200, { count: (results || []).length, ...doneMeta(t0) });
    }

    // -------- POST --------
    if (method === "POST") {
      const body = await safeJson(request);
      log(ctx, "info", "users.post.body", { body });

      const name = String(body?.name ?? "").trim();
      const email = String(body?.email ?? "").trim();
      if (!name || !email) return json(ctx, { error: "name and email are required" }, 400, doneMeta(t0));

      const id = Date.now();
      const createdAt = new Date().toISOString();

      try {
        const res = await db
          .prepare("INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)")
          .bind(id, name, email, createdAt)
          .run();
        log(ctx, "info", "users.post.db.insert", { changes: res?.meta?.changes ?? null, id });
      } catch (e) {
        const es = String(e);
        log(ctx, "error", "users.post.db.error", { error: es });
        if (es.includes("UNIQUE")) return json(ctx, { error: "email already exists" }, 409, doneMeta(t0));
        throw e;
      }

      return json(ctx, { ok: true, id }, 201, doneMeta(t0));
    }

    // -------- PUT --------
    if (method === "PUT") {
      const body = await safeJson(request);
      log(ctx, "info", "users.put.body", { body });

      const id = Number(body?.id);
      if (!Number.isInteger(id)) return json(ctx, { error: "id must be integer" }, 400, doneMeta(t0));

      const name = body?.name != null ? String(body.name).trim() : undefined;
      const email = body?.email != null ? String(body.email).trim() : undefined;

      if (name == null && email == null) return json(ctx, { error: "nothing to update" }, 400, doneMeta(t0));

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
        log(ctx, "info", "users.put.db.update", { changes: res?.meta?.changes ?? null, id });
        if (res.meta.changes === 0) return json(ctx, { error: "not found" }, 404, doneMeta(t0));
      } catch (e) {
        const es = String(e);
        log(ctx, "error", "users.put.db.error", { error: es });
        if (es.includes("UNIQUE")) return json(ctx, { error: "email already exists" }, 409, doneMeta(t0));
        throw e;
      }

      return json(ctx, { ok: true }, 200, doneMeta(t0));
    }

    // -------- DELETE --------
    if (method === "DELETE") {
      const qId = url.searchParams.get("id");
      const body = await safeJson(request).catch(() => ({}));
      const idRaw = qId ?? body?.id;
      const id = Number(idRaw);
      log(ctx, "info", "users.delete.input", { id: idRaw });

      if (!Number.isInteger(id)) return json(ctx, { error: "id must be integer" }, 400, doneMeta(t0));

      const res = await db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
      log(ctx, "info", "users.delete.db.delete", { changes: res?.meta?.changes ?? null, id });
      if (res.meta.changes === 0) return json(ctx, { error: "not found" }, 404, doneMeta(t0));

      return json(ctx, { ok: true }, 200, doneMeta(t0));
    }

    return json(ctx, { error: "Method Not Allowed" }, 405, doneMeta(t0));
  } catch (e) {
    log(ctx, "error", "users.unhandled.error", { error: String(e) });
    return json(ctx, { error: String(e) }, 500, doneMeta(t0));
  }
}
