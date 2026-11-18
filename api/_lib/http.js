/* Small helpers shared by the API functions. */
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const json = (data, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

export async function readJson(request, limit = 20_000) {
  const text = await request.text();
  if (text.length > limit) throw new HttpError(413, "Request too large.");
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, "Invalid request."); }
}

export function handle(fn) {
  return async (request) => {
    try {
      return await fn(request);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Something went wrong on our side. Please try again." }, 500);
    }
  };
}

/* Validation */
export const str = (v, max = 200) => String(v ?? "").trim().slice(0, max);
export const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
export const isTime = (v) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export function int(v, min, max, label) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label} must be a whole number from ${min} to ${max}.`);
  return n;
}
