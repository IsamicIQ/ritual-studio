/* Public timetable for today plus the next 7 days (today is shown but can't be booked): classes, one-off changes and how many spots are left.
   No client details leave the server here. */
import { DAYS_AHEAD, db, LIVE, studioToday } from "./_lib/db.js";
import { handle, json } from "./_lib/http.js";

export const GET = handle(async () => {
  const sql = db();
  const from = studioToday(0), to = studioToday(DAYS_AHEAD);
  const [classes, overrides, counts] = await Promise.all([
    sql`select c.id, c.day, c.time, c.name, c.duration, c.capacity, c.level, c.type, c.price,
               split_part(s.name, ' ', 1) as instructor
        from classes c left join staff s on s.id = c.instructor_id and s.active
        where c.active order by c.day, c.time`,
    sql`select o.class_id, o.date, o.cancelled, o.reason, split_part(s.name, ' ', 1) as instructor
        from overrides o left join staff s on s.id = o.instructor_id
        where o.date between ${from} and ${to}`,
    sql`select class_id, date, count(*)::int as booked from bookings
        where date between ${from} and ${to} and status = any(${LIVE})
        group by class_id, date`,
  ]);

  const occ = {};
  for (const o of overrides) occ[`${o.class_id}@${o.date}`] = { cancelled: o.cancelled, reason: o.reason, instructor: o.instructor || null, booked: 0 };
  for (const c of counts) (occ[`${c.class_id}@${c.date}`] ||= { cancelled: false, reason: "", instructor: null, booked: 0 }).booked = c.booked;

  return json({ today: from, daysAhead: DAYS_AHEAD + 1, classes, occurrences: occ });
});
