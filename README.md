# Ritual Studio

Website and booking system for Ritual Studio, a pilates studio in Kenya. *Make movement your ritual.*

Live at https://ritual-studio-ten.vercel.app (hosted on Vercel; every push to `main` deploys).

## What's where

- `site/`: the website (static HTML/CSS/JS)
  - `index.html`, `horario.js`: public timetable and booking
  - `admin.html`, `admin.js`: staff admin (Today, Bookings, Timetable, Clients, Payments, Staff)
  - `reservas.js`: small client for the API, shared by both pages
- `api/`: Vercel Functions (Node.js)
  - `timetable.js` (public), `book.js` (public booking), `config.js` (public sign-in key)
  - `admin.js`: everything staff do; requires a signed-in staff member
  - `_lib/`: database, sign-in check and booking rules
- `scripts/db-setup.mjs`: creates the database tables (`npm run db:setup`)
- `tools/`: build helpers for the cinematic frames and images

## Services (connected through the Vercel Marketplace)

- **Neon Postgres**: the database (`DATABASE_URL`)
- **Clerk**: staff sign-in (`CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`)
- **`OWNER_EMAILS`**: comma-separated emails that are always studio owners

## Staff roles

- **Instructor**: sees the schedule, marks attendance and adds client notes
- **Manager**: also handles bookings, payments, clients and the timetable
- **Owner**: also manages the staff list

## Local development

```bash
npm install
vercel env pull .env.local --yes
npm run db:setup
vercel dev
```

## Not done yet

- Online payments (M-Pesa STK push, card): bookings paid by M-Pesa or card show as "Awaiting payment" until staff record the payment.
- Emails/SMS to clients (booking confirmations, cancellations, waitlist moves).
