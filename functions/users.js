export const onRequest = async () => {
  return new Response(JSON.stringify({ status: "ok", users: [] }), {
    headers: { "Content-Type": "application/json" },
  });
};