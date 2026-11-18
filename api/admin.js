/* Staff admin API.
   GET  /api/admin            -> everything the admin page shows (signed-in staff only)
   POST /api/admin {op, ...}  -> one change, then the fresh data

   Roles: instructor = view, attendance, client notes
          manager    = everything except the staff list
          owner      = everything */
import { can, requireStaff, ROLES } from "./_lib/auth.js";
import { createBooking, findOrCreateClient, lockStatement, promoteStatement, validateContact } from "./_lib/bookings.js";
import { camel, camelAll, db, LIVE, newId, normPhone, studioToday } from "./_lib/db.js";
import { handle, HttpError, int, isDate, isEmail, isTime, json, readJson, str } from "./_lib/http.js";

const METHODS = ["mpesa", "card", "cash"];
const KINDS = ["class", "package", "private", "other"];

async function snapshot(sql, staff) {
  const since = studioToday(-90);
  const [team, classes, overrides, bookings, clients, notes, payments] = await Promise.all([
    sql`select id, name, email, role, active, created_at, (clerk_user_id is not null) as signed_in from staff order by active desc, name`,
    sql`select * from classes order by day, time`,
    sql`select * from overrides where date >= ${since}`,
    sql`select * from bookings where date >= ${since} or status in ('awaiting-payment','waitlist') order by date, time, created_at`,
    sql`select * from clients order by name`,
    sql`select * from client_notes order by date desc`,
    can(staff, "manager") ? sql`select * from payments where date > now() - interval '365 days' order by date desc` : Promise.resolve([]),
  ]);
  return {
    me: camel({ id: staff.id, name: staff.name, email: staff.email, role: staff.role }),
    today: studioToday(0),
    staff: camelAll(team), classes: camelAll(classes), overrides: camelAll(overrides),
    bookings: camelAll(bookings), clients: camelAll(clients), notes: camelAll(notes), payments: camelAll(payments),
  };
}

const one = async (q, msg = "That item no longer exists. Refresh the page.") => {
  const rows = await q;
  if (!rows.length) throw new HttpError(404, msg);
  return rows[0];
};

const OPS = {
  /* ── bookings ── */
  "booking.create": ["manager", async (sql, a, me) => {
    const contact = validateContact(a, { requireEmail: false });
    return createBooking(sql, { classId: a.classId, date: a.date, contact, payment: a.payment || "studio", source: "studio", createdBy: me.id, allowPast: true });
  }],

  "booking.cancel": ["manager", async (sql, a) => {
    const b = await one(sql`select class_id, date from bookings where id = ${str(a.id)}`);
    const [, , promoted] = await sql.transaction([
      lockStatement(sql, b.class_id, b.date),
      sql`with b as (
            update bookings set status = 'cancelled', cancelled_by = 'studio', cancelled_at = now(),
              paid_with = case when paid_with = 'credit' then null else paid_with end,
              paid_at = case when paid_with = 'credit' then null else paid_at end
            where id = ${str(a.id)} and status <> 'cancelled'
            returning client_id, (select paid_with from bookings where id = ${str(a.id)}) as was)
          update clients set credits = credits + 1 where id in (select client_id from b where was = 'credit')`,
      promoteStatement(sql, b.class_id, b.date),
    ]);
    return { promoted: promoted[0] || null };
  }],

  "booking.restore": ["manager", async (sql, a) => {
    const b = await one(sql`select class_id, date from bookings where id = ${str(a.id)}`);
    const [, rows] = await sql.transaction([
      lockStatement(sql, b.class_id, b.date),
      sql`update bookings set cancelled_by = null, cancelled_at = null, status =
            case when (select count(*) from bookings where class_id = ${b.class_id} and date = ${b.date} and status = any(${LIVE}))
                      < (select capacity from classes where id = ${b.class_id})
                 then case when paid_at is not null then 'paid' when payment = 'studio' then 'confirmed' else 'awaiting-payment' end
                 else 'waitlist' end
          where id = ${str(a.id)} and status = 'cancelled' returning status`,
    ]);
    return { status: rows[0]?.status };
  }],

  "booking.promote": ["manager", async (sql, a) =>
    one(sql`update bookings set promoted_at = now(),
              status = case when payment = 'studio' then 'confirmed' else 'awaiting-payment' end
            where id = ${str(a.id)} and status = 'waitlist' returning id`)],

  "booking.attendance": ["instructor", async (sql, a) => {
    const v = a.value === "attended" || a.value === "no-show" ? a.value : null;
    return one(sql`update bookings set attendance = ${v} where id = ${str(a.id)} returning id`);
  }],

  "booking.useCredit": ["manager", async (sql, a) => {
    const rows = await sql`
      with c as (
        update clients set credits = credits - 1
        where id = (select client_id from bookings where id = ${str(a.id)} and status in ('confirmed','awaiting-payment'))
          and credits > 0 returning id)
      update bookings set status = 'paid', paid_with = 'credit', paid_at = now()
      where id = ${str(a.id)} and exists (select 1 from c) returning id`;
    if (!rows.length) {
      const [b] = await sql`select status from bookings where id = ${str(a.id)}`;
      throw new HttpError(409, b && !["confirmed", "awaiting-payment"].includes(b.status)
        ? "This booking is already paid or cancelled." : "This client has no class credits left.");
    }
    return rows[0];
  }],

  /* ── payments ── */
  "payment.record": ["manager", async (sql, a, me) => {
    const method = METHODS.includes(a.method) ? a.method : null;
    if (!method) throw new HttpError(400, "Choose M-Pesa, card or cash.");
    const amount = Number(a.amount);
    if (!(amount >= 0 && amount < 10_000_000)) throw new HttpError(400, "Enter the amount paid in KES.");
    const kind = KINDS.includes(a.kind) ? a.kind : (a.bookingId ? "class" : "package");
    const credits = a.credits ? int(a.credits, 0, 500, "Credits") : 0;
    const client = await one(sql`select id from clients where id = ${str(a.clientId)}`, "Choose a client.");
    let bookingId = null;
    if (a.bookingId) bookingId = (await one(sql`select id from bookings where id = ${str(a.bookingId)} and client_id = ${client.id}`)).id;
    const id = newId();
    await sql.transaction([
      sql`insert into payments (id, client_id, booking_id, amount, method, reference, kind, package_name, credits, staff_id)
          values (${id}, ${client.id}, ${bookingId}, ${amount}, ${method}, ${str(a.reference, 80)}, ${kind},
                  ${str(a.packageName, 120)}, ${credits}, ${me.id})`,
      sql`update bookings set status = 'paid', paid_with = ${method}, paid_at = now()
          where id = ${bookingId} and status in ('confirmed','awaiting-payment')`,
      sql`update clients set credits = credits + ${credits} where id = ${client.id}`,
    ]);
    return { id };
  }],

  /* ── clients ── */
  "client.create": ["manager", async (sql, a) => {
    const contact = validateContact(a, { requireEmail: false });
    return camel(await findOrCreateClient(sql, contact));
  }],

  "client.update": ["manager", async (sql, a) => {
    const c = await one(sql`select * from clients where id = ${str(a.id)}`);
    const name = a.name !== undefined ? str(a.name, 120) : c.name;
    const phone = a.phone !== undefined ? str(a.phone, 30) : c.phone;
    const email = a.email !== undefined ? str(a.email, 200).toLowerCase() : c.email;
    if (name.length < 2) throw new HttpError(400, "The client needs a name.");
    if (email && !isEmail(email)) throw new HttpError(400, "That email address doesn't look right.");
    const credits = a.credits !== undefined ? int(a.credits, 0, 500, "Credits") : c.credits;
    try {
      return camel(await one(sql`
        update clients set name = ${name}, phone = ${phone}, phone_norm = ${normPhone(phone)}, email = ${email},
          health = ${a.health !== undefined ? str(a.health, 2000) : c.health},
          notes = ${a.notes !== undefined ? str(a.notes, 2000) : c.notes}, credits = ${credits}
        where id = ${c.id} returning *`));
    } catch (e) {
      if (e.code === "23505") throw new HttpError(409, "Another client already has this phone number.");
      throw e;
    }
  }],

  "client.note": ["instructor", async (sql, a, me) => {
    const text = str(a.text, 2000);
    if (!text) throw new HttpError(400, "Write a note first.");
    await one(sql`select id from clients where id = ${str(a.clientId)}`);
    return one(sql`insert into client_notes (id, client_id, text, staff_id) values (${newId()}, ${str(a.clientId)}, ${text}, ${me.id}) returning id`);
  }],

  /* ── timetable ── */
  "class.add": ["manager", async (sql, a) => {
    const c = classFields(a, {});
    return one(sql`insert into classes (id, day, time, name, duration, capacity, level, type, instructor_id)
      values (${newId()}, ${c.day}, ${c.time}, ${c.name}, ${c.duration}, ${c.capacity}, ${c.level}, ${c.type}, ${c.instructorId})
      returning id`);
  }],

  "class.update": ["manager", async (sql, a) => {
    const old = camel(await one(sql`select * from classes where id = ${str(a.id)}`));
    const c = classFields(a, old);
    return one(sql`update classes set day = ${c.day}, time = ${c.time}, name = ${c.name}, duration = ${c.duration},
        capacity = ${c.capacity}, level = ${c.level}, type = ${c.type}, instructor_id = ${c.instructorId}
      where id = ${old.id} returning id`);
  }],

  "class.remove": ["manager", async (sql, a) => {
    const id = str(a.id);
    const [, cancelled] = await sql.transaction([
      sql`update classes set active = false where id = ${id}`,
      cancelMany(sql, "class-removed", id, null),
    ]);
    return { cancelledBookings: cancelled.length };
  }],

  "occurrence.set": ["manager", async (sql, a) => {
    const classId = str(a.classId), date = a.date;
    if (!isDate(date)) throw new HttpError(400, "Pick a valid date.");
    await one(sql`select id from classes where id = ${classId}`);
    const cancelled = !!a.cancelled;
    const instructorId = a.instructorId ? (await one(sql`select id from staff where id = ${str(a.instructorId)}`, "Pick an instructor from the list.")).id : null;
    const [, , cancelledRows] = await sql.transaction([
      lockStatement(sql, classId, date),
      sql`insert into overrides (class_id, date, cancelled, reason, instructor_id)
          values (${classId}, ${date}, ${cancelled}, ${str(a.reason, 200)}, ${instructorId})
          on conflict (class_id, date) do update set cancelled = excluded.cancelled, reason = excluded.reason,
            instructor_id = excluded.instructor_id`,
      cancelled
        ? cancelMany(sql, "class-cancelled", classId, date)
        : sql`delete from overrides where class_id = ${classId} and date = ${date} and not cancelled and instructor_id is null returning class_id`,
    ]);
    return { cancelledBookings: cancelled ? cancelledRows.length : 0 };
  }],

  /* ── staff ── */
  "staff.add": ["owner", async (sql, a) => {
    const email = str(a.email, 200).toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, "Enter the email address they'll sign in with.");
    const role = ROLES.includes(a.role) ? a.role : "instructor";
    try {
      return await one(sql`insert into staff (id, name, email, role) values (${newId()}, ${str(a.name, 120)}, ${email}, ${role}) returning id`);
    } catch (e) {
      if (e.code === "23505") throw new HttpError(409, "Someone with this email is already on the staff list.");
      throw e;
    }
  }],

  "staff.update": ["owner", async (sql, a, me) => {
    const s = await one(sql`select * from staff where id = ${str(a.id)}`);
    const role = a.role !== undefined ? (ROLES.includes(a.role) ? a.role : s.role) : s.role;
    const active = a.active !== undefined ? !!a.active : s.active;
    if (s.role === "owner" && (role !== "owner" || !active)) {
      const [{ n }] = await sql`select count(*)::int as n from staff where role = 'owner' and active and id <> ${s.id}`;
      if (n === 0) throw new HttpError(409, "The studio needs at least one active owner.");
    }
    if (s.id === me.id && !active) throw new HttpError(409, "You can't deactivate your own account.");
    return one(sql`update staff set name = ${a.name !== undefined ? str(a.name, 120) : s.name}, role = ${role}, active = ${active}
      where id = ${s.id} returning id`);
  }],
};

/* Cancel every booking for a class (one date, or all future dates), giving back any class credits used. */
function cancelMany(sql, why, classId, date) {
  return sql`
    with old as (
      select id, client_id, paid_with from bookings
      where class_id = ${classId}
        and (${date}::text is null and date >= ${studioToday(0)} or date = ${date})
        and status in ('confirmed','awaiting-payment','paid','waitlist')),
    upd as (
      update bookings b set status = 'cancelled', cancelled_by = ${why}, cancelled_at = now(),
        paid_with = case when b.paid_with = 'credit' then null else b.paid_with end,
        paid_at = case when b.paid_with = 'credit' then null else b.paid_at end
      from old where b.id = old.id returning b.id),
    refund as (
      update clients c set credits = c.credits + r.n
      from (select client_id, count(*)::int as n from old where paid_with = 'credit' group by client_id) r
      where c.id = r.client_id returning c.id)
    select id from upd`;
}

function classFields(a, old) {
  const v = { ...old, ...a };
  const name = str(v.name, 80);
  if (name.length < 2) throw new HttpError(400, "Give the class a name.");
  if (!isTime(v.time)) throw new HttpError(400, "Enter a start time like 07:00.");
  return {
    day: int(v.day, 1, 7, "Day"), time: v.time, name,
    duration: int(v.duration, 10, 240, "Minutes"), capacity: int(v.capacity, 1, 100, "Spots"),
    level: str(v.level || "All levels", 40), type: v.type === "mat" ? "mat" : v.type === "private" ? "private" : "reformer",
    instructorId: v.instructorId ? str(v.instructorId) : null,
  };
}

export const GET = handle(async (request) => {
  const sql = db();
  const me = await requireStaff(request);
  return json(await snapshot(sql, me));
});

export const POST = handle(async (request) => {
  const sql = db();
  const body = await readJson(request);
  const entry = OPS[body.op];
  if (!entry) throw new HttpError(400, "Unknown action.");
  const [minRole, run] = entry;
  const me = await requireStaff(request, minRole);
  const result = await run(sql, body, me);
  return json({ result, data: await snapshot(sql, me) });
});
