/* Card payments with Paystack (https://paystack.com/docs/api/transaction/).
   Flow: start a transaction -> the client pays on Paystack's page -> Paystack sends them back
   to the site and also calls our webhook. Both paths verify with Paystack before marking the
   booking paid, and the unique payments.pay_ref index makes it safe if both arrive. */
import { newId } from "./db.js";
import { HttpError } from "./http.js";

const API = "https://api.paystack.co";
export const secretKey = () => process.env.PAYSTACK_SECRET_KEY || "";

async function paystack(path, { method = "GET", body } = {}) {
  if (!secretKey()) throw new HttpError(503, "Card payments aren't switched on yet.");
  const r = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${secretKey()}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.status === false) {
    console.error("Paystack error", r.status, j.message);
    throw new HttpError(502, "The card payment service didn't respond. Please try again, or pay by M-Pesa or at the studio.");
  }
  return j.data;
}

/* Start paying for one booking. Returns the Paystack page to send the client to. */
export async function startPayment(sql, bookingId, origin) {
  const [b] = await sql`select * from bookings where id = ${bookingId}`;
  if (!b) throw new HttpError(404, "Booking not found.");
  if (b.status !== "awaiting-payment") throw new HttpError(409, b.status === "paid" ? "This booking is already paid." : "This booking isn't waiting for payment.");
  if (!b.email) throw new HttpError(400, "Card payments need an email address on the booking.");
  if (!(b.price > 0)) throw new HttpError(400, "This class has no price set. Please pay at the studio.");

  const reference = `rs-${b.id}-${newId().slice(0, 6)}`;
  const data = await paystack("/transaction/initialize", {
    method: "POST",
    body: {
      email: b.email,
      amount: b.price * 100,          // Paystack takes the amount in cents
      currency: "KES",
      reference,
      callback_url: `${origin}/book.html`,
      channels: ["card"],
      metadata: { bookingId: b.id, className: b.class_name, date: b.date, time: b.time, name: b.name },
    },
  });
  await sql`update bookings set pay_ref = ${reference} where id = ${b.id}`;
  return data.authorization_url;
}

/* Ask Paystack about a transaction and, if it succeeded for the right amount, mark the booking paid. */
export async function confirmPayment(sql, reference) {
  if (!/^rs-[a-f0-9]{12}-[a-f0-9]{6}$/.test(String(reference))) throw new HttpError(400, "Unknown payment reference.");
  const tx = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  const bookingId = reference.split("-")[1];
  const [b] = await sql`select * from bookings where id = ${bookingId}`;
  if (!b) throw new HttpError(404, "Booking not found.");
  if (tx.status !== "success") return { paid: false, status: tx.status, booking: b };
  if (tx.currency !== "KES" || Number(tx.amount) !== b.price * 100) {
    console.error("Paystack amount mismatch", reference, tx.amount, tx.currency, b.price);
    return { paid: false, status: "amount-mismatch", booking: b };
  }
  await sql.transaction([
    sql`insert into payments (id, client_id, booking_id, amount, method, reference, kind, pay_ref)
        values (${newId()}, ${b.client_id}, ${b.id}, ${b.price}, 'card', ${reference}, 'class', ${reference})
        on conflict (pay_ref) where pay_ref is not null do nothing`,
    sql`update bookings set status = 'paid', paid_with = 'card', paid_at = coalesce(paid_at, now())
        where id = ${b.id} and status in ('awaiting-payment', 'confirmed')`,
  ]);
  return { paid: true, status: "success", booking: b };
}

/* Webhook signature: HMAC-SHA512 of the raw body with the secret key. */
export async function validSignature(rawBody, signature) {
  if (!secretKey() || !signature) return false;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}
