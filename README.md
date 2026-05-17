# CSC Travel — Mobile App

Cross-platform (iOS + Android) booking app for CSC Travels, built with **Expo + React Native**, sharing the same Supabase backend as the website.

## What's in v1

- 🔐 Email/password auth (Supabase Auth)
- 🗺️ Map-based booking (OpenStreetMap tiles, free, no API key)
- 📍 Pickup uses your current location, search anywhere via Nominatim
- 🛣️ Auto-calculated distance + ETA via OSRM routing
- 💰 Live fare estimate using the same rules as the website's `/Services` rate card
- 🎟️ Promocode at signup OR later in profile — gets you a % off **every** ride
- 📜 My Rides screen with status (pending → confirmed → completed)
- 👤 Editable profile

## Setup

### 1. Run the new Supabase migration

In the SAME Supabase project that powers the website, open SQL Editor and run:
```
supabase/migrations/002_profiles_and_promocodes.sql
```
(the file lives in the website repo: `~/Desktop/CSCTravels/supabase/migrations/`)

This adds:
- `profiles` table (one row per signed-up user, auto-created via trigger)
- `promocodes` table — seeded with `CSC20` = 20% off
- `user_id`, `pickup_lat/lng`, `drop_lat/lng`, `distance_km`, `estimated_fare`, `discount_pct`, `final_fare` columns on `bookings`

### 2. Fill in Supabase keys

Edit `app.json` → `expo.extra`:
```json
"extra": {
  "SUPABASE_URL": "https://YOUR-REF.supabase.co",
  "SUPABASE_ANON_KEY": "your-anon-public-key"
}
```
(Same values as in the website's `.env.local`.)

### 3. Run it

```
cd ~/Desktop/csctravel
npm start
```

Then either:
- Press **i** → iOS simulator (needs Xcode)
- Press **a** → Android emulator (needs Android Studio)
- Scan the QR code with **Expo Go** app on your phone (easiest)

## Adding new promocodes

In Supabase SQL editor:
```sql
insert into promocodes (code, discount_pct, notes)
values ('SUMMER25', 25, 'Summer offer');
```
Or use the Supabase Table Editor UI on `promocodes`.

## Free-tier limits we depend on

- **OpenStreetMap tiles** — free, attribution shown on map
- **Nominatim geocoding** — 1 req/sec; we debounce input by 400ms
- **OSRM routing** — public server, fine for low traffic; self-host on a $5 VPS later
- **Supabase** — 50k MAU, 500MB DB, free auth

## Folder layout

```
app/
  _layout.tsx           # root + auth gate
  (auth)/login.tsx
  (auth)/signup.tsx     # includes promocode field
  (tabs)/index.tsx      # Book: map + pickup/drop + fare
  (tabs)/rides.tsx      # My Rides
  (tabs)/profile.tsx    # Profile + promocode editor
lib/
  supabase.ts           # client
  auth.tsx              # session + profile context
  maps.ts               # Nominatim + OSRM helpers
  fare.ts               # fare estimation rules
  theme.ts              # colors, spacing
```

## What's NOT in v1 (good v2 targets)

- Phone OTP (needs paid SMS — Twilio/MSG91)
- Push notifications when status changes
- In-app payments (Razorpay)
- Driver app
- Ride history filters / receipts (PDF email)
# CSCAPK
