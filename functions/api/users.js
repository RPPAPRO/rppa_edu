export async function onRequest() {
  return new Response(JSON.stringify({ status: "ok", users: [] }), {
    headers: { "content-type": "application/json" },
  });
}