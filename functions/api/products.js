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
    // /api/products            -> список
    // /api/products?id=123     -> один по id
    if (method === "GET") {
      const idParam = url.searchParams.get("id");

      if (idParam) {
        const id = Number(idParam);
        if (!Number.isInteger(id)) return json(ctx, { error: "id must be integer" }, 400);
        log(ctx, "info", "products.get.byId", { id });

        const row = await db
          .prepare("SELECT id, name, description, price_cents, image_url FROM products WHERE id = ?")
          .bind(id)
          .first();

        return json(ctx, { product: row ?? null }, 200, doneMeta(t0));
      }

      log(ctx, "info", "products.get.list", {});
      const { results } = await db
        .prepare("SELECT id, name, description, price_cents, image_url FROM products ORDER BY id DESC")
        .all();

      return json(ctx, { products: results ?? [] }, 200, { count: (results || []).length, ...doneMeta(t0) });
    }

    // -------- POST --------
    // body: { name, description, price_cents, image_url? }
    if (method === "POST") {
      const body = await safeJson(request);
      log(ctx, "info", "products.post.body", { body });

      const name = String(body?.name ?? "").trim();
      const description = String(body?.description ?? "").trim();
      const price_cents = Number(body?.price_cents);
      const image_url = body?.image_url != null ? String(body.image_url).trim() : null;

      if (!name || !description || !Number.isInteger(price_cents) || price_cents < 0) {
        return json(
          ctx,
          { error: "name, description, price_cents (non-negative integer) are required" },
          400,
          doneMeta(t0)
        );
      }

      const id = Date.now();

      try {
        const res = await db
          .prepare("INSERT INTO products (id, name, description, price_cents, image_url) VALUES (?, ?, ?, ?, ?)")
          .bind(id, name, description, price_cents, image_url)
          .run();
        log(ctx, "info", "products.post.db.insert", { changes: res?.meta?.changes ?? null, id });
      } catch (e) {
        const es = String(e);
        log(ctx, "error", "products.post.db.error", { error: es });
        throw e;
      }

      return json(ctx, { ok: true, id }, 201, doneMeta(t0));
    }

    // -------- PUT --------
    // body: { id, name?, description?, price_cents?, image_url? }
    if (method === "PUT") {
      const body = await safeJson(request);
      log(ctx, "info", "products.put.body", { body });

      const id = Number(body?.id);
      if (!Number.isInteger(id)) return json(ctx, { error: "id must be integer" }, 400, doneMeta(t0));

      const updates = [];
      const binds = [];

      if (body?.name != null && String(body.name).trim() !== "") {
        updates.push("name = ?");
        binds.push(String(body.name).trim());
      }
      if (body?.description != null && String(body.description).trim() !== "") {
        updates.push("description = ?");
        binds.push(String(body.description).trim());
      }
      if (body?.price_cents != null) {
        const pc = Number(body.price_cents);
        if (!Number.isInteger(pc) || pc < 0) {
          return json(ctx, { error: "price_cents must be non-negative integer" }, 400, doneMeta(t0));
        }
        updates.push("price_cents = ?");
        binds.push(pc);
      }
      if (body?.image_url != null) {
        const urlStr = String(body.image_url).trim();
        updates.push("image_url = ?");
        binds.push(urlStr === "" ? null : urlStr);
      }

      if (updates.length === 0) return json(ctx, { error: "nothing to update" }, 400, doneMeta(t0));

      binds.push(id);
      const sql = `UPDATE products SET ${updates.join(", ")} WHERE id = ?`;

      try {
        const res = await db.prepare(sql).bind(...binds).run();
        log(ctx, "info", "products.put.db.update", { changes: res?.meta?.changes ?? null, id });
        if (res.meta.changes === 0) return json(ctx, { error: "not found" }, 404, doneMeta(t0));
      } catch (e) {
        const es = String(e);
        log(ctx, "error", "products.put.db.error", { error: es });
        throw e;
      }

      return json(ctx, { ok: true }, 200, doneMeta(t0));
    }

    // -------- DELETE --------
    // /api/products?id=123  ИЛИ body: { id }
    if (method === "DELETE") {
      const qId = url.searchParams.get("id");
      const body = await safeJson(request).catch(() => ({}));
      const idRaw = qId ?? body?.id;
      const id = Number(idRaw);
      log(ctx, "info", "products.delete.input", { id: idRaw });

      if (!Number.isInteger(id)) return json(ctx, { error: "id must be integer" }, 400, doneMeta(t0));

      const res = await db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
      log(ctx, "info", "products.delete.db.delete", { changes: res?.meta?.changes ?? null, id });
      if (res.meta.changes === 0) return json(ctx, { error: "not found" }, 404, doneMeta(t0));

      return json(ctx, { ok: true }, 200, doneMeta(t0));
    }

    return json(ctx, { error: "Method Not Allowed" }, 405, doneMeta(t0));
  } catch (e) {
    log(ctx, "error", "products.unhandled.error", { error: String(e) });
    return json(ctx, { error: String(e) }, 500, doneMeta(t0));
  }
}
