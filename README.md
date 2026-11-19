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
  - `checkout.js`, `paystack-webhook.js`: card payments with Paystack; `mpesa-code.js`: client submits their M-Pesa code
  - `_lib/`: database, sign-in check and booking rules
- `scripts/db-setup.mjs`: creates the database tables (`npm run db:setup`)
- `scripts/timetable.mjs`: the studio schedule used to seed a new database; `scripts/set-timetable.mjs` replaces the live timetable with it (only while there are no bookings)
- `tools/`: build helpers for the cinematic frames and images

## Services (connected through the Vercel Marketplace)

- **Neon Postgres**: the database (`DATABASE_URL`)
- **Clerk**: staff sign-in (`CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`)
- **Paystack**: card payments in KES (`PAYSTACK_SECRET_KEY`, set by hand in Vercel). Webhook URL: `https://ritual-studio-ten.vercel.app/api/paystack-webhook`
- **`OWNER_EMAILS`**: comma-separated emails that are always studio owners (currently ritualstudio8@gmail.com)

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

- Automatic M-Pesa confirmation: clients Send Money to 0758 097 553 and type their M-Pesa code; staff check it and click Mark paid. (Paystack can also take M-Pesa automatically if the studio wants that later.)
- Emails/SMS to clients (booking confirmations, cancellations, waitlist moves).
