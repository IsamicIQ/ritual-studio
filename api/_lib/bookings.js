/* Booking rules shared by the public booking form and staff walk-in bookings.
   Spots are counted inside a transaction holding a per-class-date lock, so two people
   can't take the last spot at the same moment. */
import { camel, classStart, LIVE, newId, normPhone } from "./db.js";
import { HttpError, isDate, isEmail, str } from "./http.js";

export const PAYMENTS = ["mpesa", "card", "studio"];
const weekday = (date) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = Monday

export async function findOrCreateClient(sql, { name, phone, email, health = "", firstTime = false }) {
  const phoneNorm = normPhone(phone);
  const mail = str(email, 200).toLowerCase();
  const h = str(health, 1000);
  let rows = phoneNorm ? await sql`select * from clients where phone_norm = ${phoneNorm}` : [];
  if (!rows.length && mail) rows = await sql`select * from clients where lower(email) = ${mail} order by created_at limit 1`;

  if (rows.length) {
    const c = rows[0];
    const [u] = await sql`
      update clients set
        name = ${name || c.name},
        phone = ${phone || c.phone},
        phone_norm = ${phoneNorm && (!c.phone_norm || c.phone_norm === phoneNorm) ? phoneNorm : c.phone_norm},
        email = ${mail || c.email},
        health = case when ${h} = '' or position(${h} in health) > 0 then health
                      when health = '' then ${h} else health || E'\n' || ${h} end
      where id = ${c.id} returning *`;
    return u;
  }
  const [c] = await sql`
    insert into clients (id, name, phone, phone_norm, email, health, first_time)
    values (${newId()}, ${name}, ${phone}, ${phoneNorm}, ${mail}, ${h}, ${!!firstTime})
    on conflict (phone_norm) where phone_norm <> '' do update set name = excluded.name
    returning *`;
  return c;
}

export function validateContact(body, { requireEmail = true } = {}) {
  const name = str(body.name, 120);
  const phone = str(body.phone, 30);
  const email = str(body.email, 200);
  if (name.length < 2) throw new HttpError(400, "Please enter your full name.");
  if (normPhone(phone).length < 9) throw new HttpError(400, "Please enter a valid phone number.");
  if ((requireEmail || email) && !isEmail(email)) throw new HttpError(400, "Please enter a valid email address.");
  return { name, phone, email, health: str(body.health, 1000), firstTime: !!body.firstTime };
}

export async function createBooking(sql, { classId, date, contact, payment, source = "online", createdBy = null, allowPast = false }) {
  if (!isDate(date)) throw new HttpError(400, "Please pick a valid date.");
  if (!PAYMENTS.includes(payment)) throw new HttpError(400, "Please choose how you'd like to pay.");

  const [cls] = await sql`select * from classes where id = ${String(classId)} and active`;
  if (!cls) throw new HttpError(404, "This class is no longer on the timetable.");
  if (cls.day !== weekday(date)) throw new HttpError(400, "That class doesn't run on this day.");
  const [ov] = await sql`select cancelled from overrides where class_id = ${cls.id} and date = ${date}`;
  if (ov && ov.cancelled) throw new HttpError(409, "This class has been cancelled.");
  if (!allowPast && classStart(date, cls.time) < new Date()) throw new HttpError(409, "This class has already started.");

  const client = await findOrCreateClient(sql, contact);
  const okStatus = payment === "studio" ? "confirmed" : "awaiting-payment";
  const id = newId();

  const [, rows] = await sql.transaction([
    sql`select pg_advisory_xact_lock(hashtext(${`${cls.id}@${date}`}))`,
    sql`
      insert into bookings (id, class_id, date, client_id, name, phone, email, payment, class_name, time,
                            health, first_time, source, status, created_by, price)
      select ${id}, ${cls.id}, ${date}, ${client.id}, ${contact.name}, ${contact.phone}, ${contact.email},
             ${payment}, ${cls.name}, ${cls.time}, ${contact.health}, ${!!contact.firstTime}, ${source},
             case when (select count(*) from bookings where class_id = ${cls.id} and date = ${date}
                        and status = any(${LIVE})) < ${cls.capacity}
                  then ${okStatus} else 'waitlist' end,
             ${createdBy}, ${cls.price}
      where not exists (select 1 from bookings where class_id = ${cls.id} and date = ${date}
                        and client_id = ${client.id} and status in ('confirmed','awaiting-payment','paid','waitlist'))
      returning *`,
  ]);
  if (!rows.length) throw new HttpError(409, "You're already booked into this class.");
  return camel(rows[0]);
}

/* After a spot opens up, move the first person on the waitlist into the class. */
export const promoteStatement = (sql, classId, date) => sql`
  update bookings set status = case when payment = 'studio' then 'confirmed' else 'awaiting-payment' end,
                      promoted_at = now()
  where id = (select id from bookings where class_id = ${classId} and date = ${date} and status = 'waitlist'
              order by created_at limit 1)
    and (select count(*) from bookings where class_id = ${classId} and date = ${date} and status = any(${LIVE}))
        < (select capacity from classes where id = ${classId})
  returning id, name`;

export const lockStatement = (sql, classId, date) =>
  sql`select pg_advisory_xact_lock(hashtext(${`${classId}@${date}`}))`;
