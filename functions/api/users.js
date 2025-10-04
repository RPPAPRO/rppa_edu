export async function onRequest(ctx) {
  const db = ctx.env.edu_rppa_db;

  try {
    const { method } = ctx.request;

    if (method === "GET") {
      const { results } = await db
        .prepare("SELECT id, name, email, created_at FROM users ORDER BY id DESC")
        .all();
      return json({ users: results ?? [] });
    }

    if (method === "POST") {
      const body = await ctx.request.json();
      const id = Date.now(); // INTEGER для твоей схемы
      const name = String(body?.name ?? "").trim();
      const email = String(body?.email ?? "").trim();
      const createdAt = new Date().toISOString();

      if (!name || !email) {
        return json({ error: "name and email are required" }, 400);
      }

      try {
        await db
          .prepare("INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)")
          .bind(id, name, email, createdAt)
          .run();
      } catch (e) {
        // ловим UNIQUE(email)
        if (String(e).includes("UNIQUE")) {
          return json({ error: "email already exists" }, 409);
        }
        throw e;
      }

      return json({ ok: true, id }, 201);
    }

    return json({ error: "Method Not Allowed" }, 405);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
