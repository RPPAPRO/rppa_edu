// functions/api/users.js

// Универсальный JSON-ответ
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function onRequest(ctx) {
  const db = ctx.env.edu_rppa_db;
  const { method } = ctx.request;

  try {
    // -------- GET --------
    // /api/users            -> список всех
    // /api/users?id=123     -> один по id
    if (method === "GET") {
      const url = new URL(ctx.request.url);
      const idParam = url.searchParams.get("id");

      if (idParam) {
        const id = Number(idParam);
        if (!Number.isInteger(id)) return json({ error: "id must be integer" }, 400);

        const row = await db.prepare(
          "SELECT id, name, email, created_at FROM users WHERE id = ?"
        ).bind(id).first();

        return json({ user: row ?? null });
      }

      const { results } = await db.prepare(
        "SELECT id, name, email, created_at FROM users ORDER BY id DESC"
      ).all();

      return json({ users: results ?? [] });
    }

    // -------- POST --------
    // body: { name, email }
    if (method === "POST") {
      const body = await safeJson(ctx.request);
      const name = String(body?.name ?? "").trim();
      const email = String(body?.email ?? "").trim();
      if (!name || !email) return json({ error: "name and email are required" }, 400);

      const id = Date.now(); // INTEGER, подходит под твою схему
      const createdAt = new Date().toISOString();

      try {
        await db.prepare(
          "INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)"
        ).bind(id, name, email, createdAt).run();
      } catch (e) {
        if (String(e).includes("UNIQUE")) {
          return json({ error: "email already exists" }, 409);
        }
        throw e;
      }

      return json({ ok: true, id }, 201);
    }

    // -------- PUT --------
    // body: { id, name?, email? }
    if (method === "PUT") {
      const body = await safeJson(ctx.request);
      const id = Number(body?.id);
      if (!Number.isInteger(id)) return json({ error: "id must be integer" }, 400);

      const name = body?.name != null ? String(body.name).trim() : undefined;
      const email = body?.email != null ? String(body.email).trim() : undefined;

      if (name == null && email == null) {
        return json({ error: "nothing to update" }, 400);
      }

      // Строим UPDATE динамически
      const fields = [];
      const binds = [];
      if (name != null && name !== "") { fields.push("name = ?"); binds.push(name); }
      if (email != null && email !== "") { fields.push("email = ?"); binds.push(email); }
      if (fields.length === 0) return json({ error: "invalid values" }, 400);

      binds.push(id);
      try {
        const res = await db.prepare(
          `UPDATE users SET ${fields.join(", ")} WHERE id = ?`
        ).bind(...binds).run();

        if (res.meta.changes === 0) return json({ error: "not found" }, 404);
      } catch (e) {
        if (String(e).includes("UNIQUE")) {
          return json({ error: "email already exists" }, 409);
        }
        throw e;
      }

      return json({ ok: true }, 200);
    }

    // -------- DELETE --------
    // /api/users?id=123  ИЛИ body: { id }
    if (method === "DELETE") {
      const url = new URL(ctx.request.url);
      const qId = url.searchParams.get("id");
      const body = await safeJson(ctx.request).catch(() => ({}));
      const idRaw = qId ?? body?.id;

      const id = Number(idRaw);
      if (!Number.isInteger(id)) return json({ error: "id must be integer" }, 400);

      const res = await db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
      if (res.meta.changes === 0) return json({ error: "not found" }, 404);

      return json({ ok: true }, 200);
    }

    return json({ error: "Method Not Allowed" }, 405);
  } catch (e) {
    return json({ error: String(e) }, 500);
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
