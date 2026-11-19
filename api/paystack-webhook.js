/* Paystack calls this when a payment succeeds, even if the client closes the page before
   coming back to the site. Set this URL in Paystack: Settings -> API Keys & Webhooks:
   https://ritual-studio-ten.vercel.app/api/paystack-webhook */
import { confirmPayment, validSignature } from "./_lib/paystack.js";
import { db } from "./_lib/db.js";
import { json } from "./_lib/http.js";

export async function POST(request) {
  const raw = await request.text();
  if (!(await validSignature(raw, request.headers.get("x-paystack-signature")))) {
    return json({ error: "Invalid signature" }, 401);
  }
  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: "Invalid body" }, 400); }
  if (event.event === "charge.success" && event.data && event.data.reference) {
    try {
      await confirmPayment(db(), event.data.reference);
    } catch (e) {
      console.error("Paystack webhook", event.data.reference, e.message);
      if (e.status && e.status < 500) return json({ ok: true, ignored: e.message }); // not ours: don't make Paystack retry
      return json({ error: "Try again" }, 500);
    }
  }
  return json({ ok: true });
}
