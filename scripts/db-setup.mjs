/* Creates the database tables (safe to run again) and, if the timetable is empty,
   fills it with the sample timetable so the site isn't blank.
   Run: npm run db:setup   (reads DATABASE_URL from .env.local) */
import { neon } from "@neondatabase/serverless";

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
];

for (const s of statements) await sql.query(s);

// Sample timetable (same as the old preview). Staff replace it from the admin page.
const sample = [
  [1, "07:00", "Reformer Foundations", 50, 8], [1, "18:00", "Reformer Flow", 50, 8],
  [2, "07:00", "Mat Pilates", 45, 12], [2, "17:30", "Reformer Flow", 50, 8],
  [3, "07:00", "Reformer Foundations", 50, 8], [3, "12:30", "Lunchtime Mat", 40, 12],
  [4, "07:00", "Reformer Flow", 50, 8], [4, "18:00", "Reformer Foundations", 50, 8],
  [5, "07:00", "Mat Pilates", 45, 12], [5, "17:30", "Reformer Flow", 50, 8],
  [6, "09:00", "Saturday Reformer", 50, 8], [6, "10:30", "Mat Pilates", 45, 12],
];
const [{ n }] = await sql`select count(*)::int as n from classes`;
if (n === 0) {
  for (const [day, time, name, duration, capacity] of sample) {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const type = /mat/i.test(name) ? "mat" : "reformer";
    await sql`insert into classes (id, day, time, name, duration, capacity, type) values (${id}, ${day}, ${time}, ${name}, ${duration}, ${capacity}, ${type})`;
  }
  console.log(`Added the sample timetable (${sample.length} classes).`);
}

const counts = await sql`
  select (select count(*) from staff)::int as staff, (select count(*) from classes)::int as classes,
         (select count(*) from bookings)::int as bookings, (select count(*) from clients)::int as clients`;
console.log("Database ready:", counts[0]);
