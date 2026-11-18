/* Database access (Neon Postgres, provisioned through the Vercel Marketplace). */
import { neon } from "@neondatabase/serverless";

let _sql = null;
export function db() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

/* Bookings that hold a spot in a class. */
export const LIVE = ["confirmed", "awaiting-payment", "paid"];

/* The studio is in Kenya: East Africa Time, UTC+3 all year (no daylight saving). */
export const TZ = "+03:00";
export function studioToday(offsetDays = 0) {
  const now = new Date(Date.now() + 3 * 3600e3 + offsetDays * 86400e3);
  return now.toISOString().slice(0, 10);
}
export const classStart = (date, time) => new Date(`${date}T${time}:00${TZ}`);

export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

export const normPhone = (t) => {
  let d = String(t || "").replace(/\D/g, "");
  if (d.startsWith("254")) d = "0" + d.slice(3);
  if (d.length === 9 && /^[17]/.test(d)) d = "0" + d;
  return d;
};

/* snake_case rows -> camelCase objects for the browser */
const camelKey = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
export function camel(row) {
  if (!row) return row;
  const o = {};
  for (const [k, v] of Object.entries(row)) o[camelKey(k)] = v instanceof Date ? v.toISOString() : v;
  return o;
}
export const camelAll = (rows) => rows.map(camel);

/* How far ahead the public can book. */
export const DAYS_AHEAD = 7;
