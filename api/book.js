/* Public booking from the website's timetable. */
import { createBooking, validateContact } from "./_lib/bookings.js";
import { DAYS_AHEAD, db, studioToday } from "./_lib/db.js";
import { handle, HttpError, json, readJson } from "./_lib/http.js";

export const POST = handle(async (request) => {
  const body = await readJson(request);
  if (body.website) return json({ ok: true }); // honeypot: bots fill hidden fields
  const date = String(body.date || "");
  if (date < studioToday(0) || date > studioToday(DAYS_AHEAD - 1)) {
    throw new HttpError(400, "Bookings open up to a week ahead. Please pick a date on the timetable.");
  }
  const contact = validateContact(body);
  const b = await createBooking(db(), { classId: body.classId, date, contact, payment: body.payment, source: "online" });
  return json({
    booking: { id: b.id, status: b.status, className: b.className, date: b.date, time: b.time, payment: b.payment, name: b.name },
  }, 201);
});
