# Ritual Studio

Website and booking system for Ritual Studio, a pilates studio in Kenya. *Make movement your ritual.*

Live at https://ritual-studio-ten.vercel.app (hosted on Vercel; every push to `main` deploys).

## What's where

- `site/`: the website (static HTML/CSS/JS)
  - `index.html`, `horario.js`: public timetable and booking
  - `reservas.js`: small client for the API
- `api/`: Vercel Functions (Node.js)
  - `timetable.js` (public timetable), `book.js` (public booking)
  - `checkout.js`, `paystack-webhook.js`: card payments with Paystack; `mpesa-code.js`: client submits their M-Pesa code
  - `_lib/`: database, booking rules and Paystack
- `scripts/db-setup.mjs`: creates the database tables (`npm run db:setup`)
- `scripts/timetable.mjs`: the studio schedule used to seed a new database; `scripts/set-timetable.mjs` replaces the live timetable with it (only while there are no bookings)
- `tools/`: build helpers for the cinematic frames and images

## Services (connected through the Vercel Marketplace)

- **Neon Postgres**: the database (`DATABASE_URL`)
- **Paystack**: card payments in KES (`PAYSTACK_SECRET_KEY`, set by hand in Vercel). Webhook URL: `https://ritual-studio-ten.vercel.app/api/paystack-webhook`

## Local development

```bash
npm install
vercel env pull .env.local --yes
npm run db:setup
vercel dev
```

## Not done yet

- A staff screen: the admin page was removed on 2026-11-19 (it's in git history before that date). Bookings, M-Pesa codes and payments are only in the database for now.
- Automatic M-Pesa confirmation: clients Send Money to 0758 097 553 and type their M-Pesa code, which is saved on the booking. (Paystack can also take M-Pesa automatically if the studio wants that later.)
- Emails/SMS to clients (booking confirmations, cancellations, waitlist moves).
