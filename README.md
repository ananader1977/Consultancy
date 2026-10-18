# LAMA ALSAFADI RESEARCH & EXPERIMENT DEVELOPMENT ON SOCIAL SCIENCE: Booking App

Mobile-responsive appointment booking system for a consultancy (Dubai, AED, 5% VAT).
Zero npm dependencies: Node.js ≥ 22.13 only (built-in `node:sqlite`).

## Features
- **Public booking portal** (no customer accounts): name and mobile (required; email is not asked publicly and can be added by the admin), service (Online via Zoom/Teams, Offline in office).
- **Calendar**: Mon–Sat, 10:00–18:00 Dubai time, 1-hour slots, lunch 13:00–14:00 closed, no Sunday. Customers only see free slots.
- **Prices** Online AED 500 / Offline AED 1000 (editable by admin; VAT 5% added or included – setting).
- **Unique booking reference** (`CO-YYMM-00001`), then redirect to **card payment** (Stripe Checkout; demo checkout in mock mode).
- **10-minute slot lock** enforced by a database unique index (no double booking, even under concurrent requests). Late payments are honoured if the slot is still free, otherwise auto-refunded.
- **Tax invoice** (PDF, sequential `INV-YYYY-000001`) created only after payment; credit note on refund.
- **Notifications**: email to client and owner (invoice PDF + calendar invite attached), WhatsApp (Meta Cloud API), everything logged in Admin → Messages.
- **English / Arabic**: every customer page has a language button (العربية / English) with full right-to-left layout; error messages, terms and the company name switch too (`?lang=ar` links open Arabic directly).
- **Manage-booking link** in every client email (confirmation, reschedule, updates), plus a "Save your booking link" card with copy button after payment.
- **Terms & Conditions**: clients must tick an acceptance box (linking to `/terms.html`) before payment; acceptance time is stored per booking. Text is editable in Admin → Settings.
- **Customer self-service**: reschedule free until 24 h before; refund request until the appointment starts.
- **Admin console** (`/admin/`): dashboard (confirmed bookings), Outlook-style calendar (paid = green), bookings, refund approval, invoices, prices, settings, admin users, message log, 2-hour reminder pop-up + email, calendar feed (`.ics`) to subscribe in Zoho/Outlook/Google Calendar.

## Quick start
```bash
npm start                 # http://localhost:3000, demo payments
# first start prints the admin email/password once (or set ADMIN_EMAIL / ADMIN_PASSWORD)
npm run seed-demo         # optional demo data
npm test                  # 51 tests
```
Customer site: `/` · Manage booking: `/manage.html` · Admin: `/admin/`

## Going live
1. Copy `.env.example` → `.env` values into your host's environment settings.
2. `PAYMENT_PROVIDER=stripe`, set `STRIPE_SECRET_KEY`, and add a Stripe webhook to `BASE_URL/api/webhooks/stripe` (event `checkout.session.completed`) with `STRIPE_WEBHOOK_SECRET`. The app refuses to start with mock payments in production.
3. Set `SMTP_*` for email and `WHATSAPP_*` for WhatsApp (create approved templates `booking_confirmation` and `booking_update`).
4. In Admin → Settings fill company name, address, **TRN**, owner email, Zoom/Teams links.
5. Run behind HTTPS (`BASE_URL=https://…`, `TRUST_PROXY=true`). Persist the `data/` folder (SQLite) and back it up.

Docker: `docker build -t consultancy . && docker run -p 3000:3000 -v $PWD/data:/app/data --env-file .env consultancy`

## Notes / limits
- One consultant: Online and Offline share one slot pool (one booking per hour).
- Invoice PDFs use a built-in Latin-1 PDF writer: Arabic names appear as `?` on the PDF (emails/screens are fine).
- Run a single instance (SQLite).
- Admin password reset: `npm run create-admin -- email@example.com NewPassw0rd123`.

## Hosting (website)
This app needs a Node server and a database, so GitHub Pages cannot host it. Use `render.yaml`:
Render → New → Blueprint → select this repo → fill `BASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Deploys automatically on every push.
