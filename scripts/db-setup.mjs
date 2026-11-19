/* Creates the database tables (safe to run again) and, if the timetable is empty,
   fills it with the studio's schedule from scripts/timetable.mjs.
   Run: npm run db:setup   (reads DATABASE_URL from .env.local) */
import { neon } from "@neondatabase/serverless";
import { TIMETABLE } from "./timetable.mjs";

const sql = neon(process.env.DATABASE_URL);

const statements = [
  `create table if not exists staff (
     id text primary key,
     name text not null default '',
     email text not null unique,
     role text not null default 'instructor' check (role in ('owner','manager','instructor')),
     active boolean not null default true,
     clerk_user_id text,
     created_at timestamptz not null default now())`,

  `create table if not exists classes (
     id text primary key,
     day int not null check (day between 1 and 7),
     time text not null,
     name text not null,
     duration int not null default 50,
     capacity int not null default 8,
     level text not null default 'All levels',
     type text not null default 'reformer',
     instructor_id text references staff(id) on delete set null,
     active boolean not null default true,
     created_at timestamptz not null default now())`,

  `create table if not exists overrides (
     class_id text not null references classes(id) on delete cascade,
     date text not null,
     cancelled boolean not null default false,
     reason text not null default '',
     instructor_id text references staff(id) on delete set null,
     primary key (class_id, date))`,

  `create table if not exists clients (
     id text primary key,
     name text not null,
     phone text not null default '',
     phone_norm text not null default '',
     email text not null default '',
     health text not null default '',
     notes text not null default '',
     credits int not null default 0,
     first_time boolean not null default false,
     created_at timestamptz not null default now())`,
  `create unique index if not exists clients_phone_norm on clients (phone_norm) where phone_norm <> ''`,
  `create index if not exists clients_email on clients (lower(email))`,

  `create table if not exists bookings (
     id text primary key,
     class_id text not null references classes(id),
     date text not null,
     client_id text not null references clients(id),
     name text not null,
     phone text not null default '',
     email text not null default '',
     payment text not null default 'studio',
     class_name text not null,
     time text not null,
     health text not null default '',
     first_time boolean not null default false,
     source text not null default 'online',
     status text not null,
     attendance text,
     paid_with text,
     paid_at timestamptz,
     cancelled_by text,
     cancelled_at timestamptz,
     promoted_at timestamptz,
     created_by text,
     created_at timestamptz not null default now())`,
  `create index if not exists bookings_class_date on bookings (class_id, date)`,
  `create index if not exists bookings_date on bookings (date)`,
  `create index if not exists bookings_client on bookings (client_id)`,

  `create table if not exists payments (
     id text primary key,
     client_id text not null references clients(id),
     booking_id text references bookings(id) on delete set null,
     amount numeric(12,2) not null default 0,
     method text not null,
     reference text not null default '',
     kind text not null default 'class',
     package_name text not null default '',
     credits int not null default 0,
     staff_id text references staff(id) on delete set null,
     date timestamptz not null default now())`,
  `create index if not exists payments_client on payments (client_id)`,

  `create table if not exists client_notes (
     id text primary key,
     client_id text not null references clients(id) on delete cascade,
     text text not null,
     staff_id text references staff(id) on delete set null,
     date timestamptz not null default now())`,

  /* Payments (added 2026-11-19): class prices, M-Pesa codes from clients, Paystack card payments. */
  `alter table classes add column if not exists price int not null default 0`,
  `update classes set price = case when type = 'mat' then 2000 else 3000 end where price = 0`,
  `alter table bookings add column if not exists price int not null default 0`,
  `alter table bookings add column if not exists mpesa_code text`,
  `alter table bookings add column if not exists mpesa_code_at timestamptz`,
  `alter table bookings drop column if exists stripe_session`,
  `alter table payments drop column if exists stripe_session`,
  `alter table bookings add column if not exists pay_ref text`,
  `alter table payments add column if not exists pay_ref text`,
  `create unique index if not exists payments_pay_ref on payments (pay_ref) where pay_ref is not null`,
];

for (const s of statements) await sql.query(s);

const [{ n }] = await sql`select count(*)::int as n from classes`;
if (n === 0) {
  for (const c of TIMETABLE) {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    await sql`insert into classes (id, day, time, name, duration, capacity, level, type, price)
      values (${id}, ${c.day}, ${c.time}, ${c.name}, ${c.duration}, ${c.capacity}, ${c.level}, ${c.type}, ${c.price})`;
  }
  console.log(`Added the studio timetable (${TIMETABLE.length} classes).`);
}

const counts = await sql`
  select (select count(*) from staff)::int as staff, (select count(*) from classes)::int as classes,
         (select count(*) from bookings)::int as bookings, (select count(*) from clients)::int as clients`;
console.log("Database ready:", counts[0]);
