/* Replaces the whole weekly timetable with scripts/timetable.mjs.
   Refuses if any class already has bookings, so real bookings are never lost.
   Run: node --env-file=.env.local scripts/set-timetable.mjs */
import { neon } from "@neondatabase/serverless";
import { TIMETABLE } from "./timetable.mjs";

const sql = neon(process.env.DATABASE_URL);
const [{ n }] = await sql`select count(*)::int as n from bookings`;
if (n > 0) {
  console.error(`Stopped: there are ${n} bookings. Replacing the timetable now would remove classes people have booked.`);
  process.exit(1);
}
const id = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);
await sql.transaction([
  sql`delete from overrides`,
  sql`delete from classes`,
  ...TIMETABLE.map((c) => sql`
    insert into classes (id, day, time, name, duration, capacity, level, type, price)
    values (${id()}, ${c.day}, ${c.time}, ${c.name}, ${c.duration}, ${c.capacity}, ${c.level}, ${c.type}, ${c.price})`),
]);
const rows = await sql`select day, count(*)::int as n from classes group by day order by day`;
console.log(`Timetable replaced: ${TIMETABLE.length} classes.`, rows.map((r) => `day ${r.day}: ${r.n}`).join(", "));
