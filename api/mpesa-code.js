/* After paying by M-Pesa (Send Money to the studio's number), the client sends the
   confirmation code from their M-Pesa SMS. Staff match it in the admin and mark the booking paid.
   The booking id is only known to the person who made the booking. */
import { db } from "./_lib/db.js";
import { handle, HttpError, json, readJson, str } from "./_lib/http.js";

export const POST = handle(async (request) => {
  const body = await readJson(request);
  const id = str(body.bookingId, 40);
  const code = str(body.code, 40).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{8,12}$/.test(code)) {
    throw new HttpError(400, "That doesn't look like an M-Pesa code. It's the 10 letters and numbers at the start of your M-Pesa SMS, like QJK3ABCD12.");
  }
  const rows = await db()`
    update bookings set mpesa_code = ${code}, mpesa_code_at = now()
    where id = ${id} and payment = 'mpesa' and status = 'awaiting-payment'
    returning id`;
  if (!rows.length) throw new HttpError(409, "This booking isn't waiting for an M-Pesa payment. If you think that's wrong, contact the studio.");
  return json({ ok: true });
});
