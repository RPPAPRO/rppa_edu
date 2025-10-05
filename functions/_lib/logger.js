export function meta(ctx) {
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

export function log(ctx, level, event, extra) {
  const base = meta(ctx);
  const payload = { ...base, level, event };
  if (extra && Object.keys(extra).length) payload.extra = extra;
  // Печатаем ОБЪЕКТ → в Real-time Logs будет красивый JSON
  console.log(payload);
}

export function preview(obj, max = 800) {
  try {
    const s = JSON.stringify(obj);
    if (s.length > max) return { truncated: true, slice: JSON.parse(s.slice(0, max)) };
    return obj;
  } catch {
    return { note: "unserializable" };
  }
}

export function json(ctx, data, status = 200, extraMeta = {}) {
  log(ctx, status >= 400 ? "error" : "info", "response", {
    status,
    dataPreview: preview(data),
    ...extraMeta,
  });
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function doneMeta(t0) {
  return { duration_ms: Math.round(performance.now() - t0) };
}

export async function safeJson(request) {
  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return {};
  const text = await request.text();
  if (!text) return {};
  return JSON.parse(text);
}
