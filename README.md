# CSCAPK — Driver App

React Native (Expo) app for **CSC Travels drivers**: log in, go online, accept trips, start with odometer, complete with payment, see earnings.

Shares the same Supabase backend as the rider app (`csctravel-rn`) and the website (`CSCTravels`). Trip lifecycle mirrors **CSCBilling**'s driver/trip model (assign → start odometer → end odometer + payment).

## Features (v1)

- 🔐 Email/password driver sign-in
- 🟢 Go online / offline toggle (mirrors `drivers.status` in Supabase)
- 🚖 See **available** unassigned trips + your **assigned** trips
- ✅ Accept a trip → it's yours, status → confirmed
- ▶️ Start a trip → enter **start odometer**, status → on-trip
- 🏁 Complete a trip → enter **end odometer** + **payment method (cash/upi/card/wallet)** → fare locked in, status → completed
- 📞 Tap-to-call the customer
- 🧭 Tap-to-navigate to pickup (Apple/Google Maps)
- 💰 Earnings: today / this week / this month with KM-based incentive
- 👤 Profile: licence, vehicle plate, base salary, per-KM rate

## Setup

### 1. Apply the new Supabase migration

In the shared Supabase project, run:
```
~/Desktop/CSCTravels/supabase/migrations/003_drivers.sql
```

It adds:
- `drivers` table (RLS — driver only sees their own row)
- `bookings.driver_id`, `start_odometer`, `end_odometer`, `actual_start_at`, `actual_end_at`, `payment_method`, `payment_status`
- `driver_attendance` table
- RLS policies so a driver can read pending unassigned bookings + their own trips, and claim/update accordingly

### 2. Create a driver in Supabase

1. **Authentication → Users → Add user**: create the driver's auth account (email + password, auto-confirm).
2. Copy the user's UUID, then in SQL editor:
```sql
insert into drivers (id, full_name, phone, email, license_no, vehicle_plate, base_salary, per_km_rate, active)
values ('USER-UUID-HERE', 'Ravi Kumar', '+919XXXXXXXXX', 'ravi@example.com',
        'BR01-2024-XXXX', 'BR01-AB-1234', 18000, 2, true);
```

### 3. Fill in Supabase keys

Edit `app.json` → `expo.extra`:
```json
"extra": {
  "SUPABASE_URL": "https://YOUR-REF.supabase.co",
  "SUPABASE_ANON_KEY": "your-anon-public-key"
}
```

### 4. Run it

```
cd ~/Desktop/cscapk-driver
npm start
```
Scan the QR with **Expo Go** on the driver's phone, or press `i` / `a` for simulators.

## Folder layout

```
app/
  _layout.tsx           # root + auth gate
  (auth)/login.tsx
  (tabs)/index.tsx      # dashboard: status toggle + today stats + lists
  (tabs)/trips.tsx      # filterable history of my trips
  (tabs)/earnings.tsx   # day/week/month earnings + incentive
  (tabs)/profile.tsx    # contact, vehicle, comp, sign out
  trip/[id].tsx         # detail + Accept/Start/Complete actions
lib/
  supabase.ts
  auth.tsx              # session + driver record + status helpers
  trips.ts              # data access + lifecycle helpers
  theme.ts
```

## Trip lifecycle

```
pending  ── accept ──▶  confirmed (driver_id set)
                          │
                          │ start (start_odometer + actual_start_at)
                          ▼
                       confirmed + actual_start_at  (= "on trip" in UI)
                          │
                          │ complete (end_odometer + payment_method)
                          ▼
                       completed (final_fare locked, payment_status='paid')
```

## v2 ideas

- Push notifications when admin assigns a trip
- Attendance check-in screen (mirrors `driver_attendance`)
- Offline-first trip queue
- Photo upload (vehicle damage, fuel slips)
- Realtime location streaming during trip
