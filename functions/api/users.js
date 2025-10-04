export async function onRequest(ctx) {
  try {
    const { results } = await ctx.env.edu_rppa_db
      .prepare("SELECT id, name, email, created_at FROM users ORDER BY id DESC")
      .all();

    return new Response(JSON.stringify({ users: results ?? [] }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}