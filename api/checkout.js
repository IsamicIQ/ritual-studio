/* Card payments (Paystack).
   POST /api/checkout {bookingId}      -> { url } of Paystack's payment page
   GET  /api/checkout?reference=...    -> { paid } after Paystack sends the client back */
import { confirmPayment, startPayment } from "./_lib/paystack.js";
import { db } from "./_lib/db.js";
import { handle, HttpError, json, readJson, str } from "./_lib/http.js";

export const POST = handle(async (request) => {
  const body = await readJson(request);
  const bookingId = str(body.bookingId, 40);
  if (!bookingId) throw new HttpError(400, "Missing booking.");
  const url = await startPayment(db(), bookingId, new URL(request.url).origin);
  return json({ url });
});

export const GET = handle(async (request) => {
  const reference = new URL(request.url).searchParams.get("reference") || "";
  const r = await confirmPayment(db(), reference);
  const b = r.booking;
  return json({ paid: r.paid, status: r.status, booking: { className: b.class_name, date: b.date, time: b.time, name: b.name } });
});
