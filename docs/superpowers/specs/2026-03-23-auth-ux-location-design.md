# Auth UX + Location Picker — Design Spec
**Date:** 2026-03-23
**Status:** Approved
**Scope:** Fix initial user experience, auth routing, location capture before catalog

---

## Problem Statement

The app currently lands all users at `/catalog` regardless of auth state. The avatar button is non-functional, the expired page is a dead-end, and there is no delivery location capture. This spec covers all fixes needed to make the app behave like a standard mobile delivery app.

---

## Goals

1. Smart root routing — authenticated users skip login, unauthenticated users see login first
2. Login page offers "Skip Login" for guest browsing
3. Location capture enforced before catalog on every app open (Option A: always confirm)
4. Avatar button is functional — login for guests, user menu for authenticated users
5. Logout is implemented end-to-end
6. Expired page has a back-to-login link
7. OTP expiry surfaces a clear message on the verify page

---

## User Flows

### Flow 1 — New / Unauthenticated User
```
/ → no session → /auth/login
  ├── Enters phone → OTP sent → /auth/verify → OTP correct
  │     └── /location → confirms/sets location → /catalog
  └── Taps "Skip Login"
        └── /location → confirms/sets location → /catalog
```

Note: Guest mode is not persisted across sessions. A guest who closes and reopens the app lands on `/auth/login` again (no session). This is intentional — "Skip Login" is per-session only.

### Flow 2 — Returning Authenticated User (valid session)
```
/ → valid session + location saved → /location (shows saved location, one-tap confirm)
                                          └── /catalog
/ → valid session + no location   → /location (fresh location picker)
                                          └── /catalog
```

### Flow 3 — Guest Taps Avatar on Catalog
```
Catalog → tap avatar → /auth/login
  ├── login success → /location → /catalog
  └── taps "Skip Login" → /location → /catalog
```

### Flow 4 — Authenticated User Taps Avatar on Catalog
```
Catalog → tap avatar → bottom sheet:
  - "Hi, {name}"
  - "My Orders" → /catalog/orders
  - "Logout" → POST /api/auth/logout → clear cookie → /auth/login
```

### Flow 5 — OTP Expired
```
/auth/verify → waits >10 min → API returns expired error
  → shows "OTP expired — tap Resend to get a new one" (not a generic error)
  → Resend button calls send-otp again
```

### Flow 6 — Expired Guest/Invite Session
```
/auth/expired → "← Back to Login" link → /auth/login
```

### Flow 7 — Change Location from Catalog
```
Catalog header "📍 {area}" tap → /location → update selection → /catalog
```

---

## Direct `/catalog` Navigation (Bookmark / Shared URL)

If a user navigates directly to `/catalog` (bypassing `/`), the catalog renders normally. If the `wl` cookie is missing, the header shows "📍 Set location" fallback and the user can tap it to go to `/location`. There is **no forced redirect from /catalog to /location** — the location step is only enforced from the root `/`. This avoids breaking deep-linked catalog URLs.

---

## Pages & Components Changed

| File | Change |
|------|--------|
| `app/src/app/page.tsx` | Server component: validate session → redirect to /location or /auth/login |
| `app/src/app/auth/login/page.tsx` (or LoginForm component) | Add "Skip Login" link below form → /location |
| `app/src/app/auth/verify/page.tsx` | After success: push /location (not /catalog); handle OTP expired error state |
| `app/src/app/auth/expired/page.tsx` | Add "← Back to Login" link |
| `app/src/app/location/page.tsx` | **New page** — full location picker (see spec below) |
| `app/src/app/catalog/CatalogClient.tsx` | Wire avatar button; show 📍 area in header; tap avatar → login or bottom sheet |
| `app/src/app/api/auth/logout/route.ts` | Implement: clear DB session + clear cookie |

---

## Location Page Spec (`/location`)

### States

**State A — No saved location (first visit)**
1. Page renders with prompt: "Where should we deliver?"
2. "Use my location" button triggers `navigator.geolocation.getCurrentPosition()`
   - On success: reverse geocode via Nominatim `https://nominatim.openstreetmap.org/reverse?lat=X&lon=Y&format=json`
     - If Nominatim returns non-2xx or network error: show error toast "Couldn't detect location — please search manually" and slide in the manual search panel
     - If resolved address has `country_code !== 'in'`: accepted as-is (out-of-India validation is out of scope for MVP; replace with Google Places later)
   - Show resolved address: "Delivering to: [area], [city]"
   - "Confirm" button → save to cookie → push /catalog
3. On geolocation denied/error: slide in manual search panel
   - Search input → debounced call to `https://nominatim.openstreetmap.org/search?q=...&countrycodes=in&format=json&limit=5`
   - If Nominatim search fails: show toast "Search unavailable — try again" and keep input active
   - Show list of suggestions (display_name)
   - User selects → save to cookie → push /catalog

**State B — Saved location exists (returning visit)**
1. Page renders showing saved location: "📍 [area], [city]"
2. Two actions: [Confirm →] [Change Location]
3. "Confirm" → push /catalog immediately
4. "Change Location" → show same picker as State A

### Location Cookie

- Name: `wl` (wineyard location)
- Value: JSON `{ address: string, area: string, city: string, lat?: number, lng?: number }`
- Max-age: 1 day — field engineers may be at a different job site the next day; short TTL ensures the location confirm prompt appears on next-day returns
- Scope: client-readable (not httpOnly) — intentional, this cookie contains no credentials or sensitive data; it is purely a UI preference. Note: `session_token` remains httpOnly/Secure as set by the existing `/api/auth/verify-otp` implementation
- **Written by:** client-side JavaScript directly via `document.cookie` (or `js-cookie` library) on the `/location` page when the user confirms a selection. No API route is needed for this write.

### Reverse Geocode Logic

Extract from Nominatim response:
- `area` = `address.suburb ?? address.neighbourhood ?? address.county`
- `city` = `address.city ?? address.town ?? address.state_district`
- Full `address` = `display_name` (truncated to first 2 comma-separated segments)

### Catalog Header Location Display

In `CatalogClient.tsx` top row (already shows "📍 Himayatnagar Warehouse" hardcoded):
- Replace hardcoded text with value from `wl` cookie: `📍 {area}, {city}`
- Tapping it navigates to `/location`
- If cookie missing: show "📍 Set location" as fallback (tappable)

---

## Logout Implementation

**`POST /api/auth/logout`**
1. Read `session_token` cookie
2. If present: `DELETE FROM sessions WHERE token_hash = hash(token)`
3. Clear cookie: `Set-Cookie: session_token=; Max-Age=0; Path=/`
4. Return `{ success: true }`

Client-side (avatar bottom sheet):
```
fetch('/api/auth/logout', { method: 'POST' })
  .finally(() => router.push('/auth/login'))
```
Fire-and-forget: redirect to `/auth/login` regardless of API success or failure. If the network call fails, the session cookie will eventually expire naturally. No error toast needed — from the user's perspective, they are logged out either way.

---

## OTP Expiry Error State

In `/auth/verify`, the `verify-otp` API already returns errors. Add a new UI state triggered when error is `code: 'otp_expired'` or `message` contains "expired":

- Show: **"Your OTP has expired. Tap below to resend."**
- Show Resend button (already exists for max-attempts case, reuse same flow)
- Do NOT increment attempt counter for expired OTP

---

## What Is NOT Changed

- Admin login (`/admin/login`) — separate flow, untouched
- Guest invite links (`/guest/[token]`) — untouched
- Cart persistence — works already (localStorage), no change
- Unregistered user message on login — works already, no change
- Product detail, Buy Again, Categories stubs — untouched

---

## Geocoding: Nominatim (OpenStreetMap)

- Free, no API key required
- Rate limit: 1 request/second (fine for user-initiated searches)
- Replace with Google Places API later by swapping the two fetch calls in `/location`
- Reverse geocode endpoint: `https://nominatim.openstreetmap.org/reverse`
- Search endpoint: `https://nominatim.openstreetmap.org/search`
- Required header: `User-Agent: wineyard-catalog/1.0`

---

## Success Criteria

- [ ] Opening `/` with no session → lands on `/auth/login`
- [ ] Opening `/` with valid session → lands on `/location` (shows saved or fresh picker)
- [ ] "Skip Login" on login page → lands on `/location`
- [ ] After OTP verify success → lands on `/location`
- [ ] `/location` confirm → lands on `/catalog` with 📍 area shown in header
- [ ] Catalog header location is tappable → goes to `/location` → change location → returns to `/catalog` with updated area
- [ ] Catalog header shows "📍 Set location" when `wl` cookie is missing
- [ ] Guest taps avatar → `/auth/login`
- [ ] Authenticated taps avatar → bottom sheet with Logout
- [ ] Logout → clears session → `/auth/login`
- [ ] `/auth/expired` has working "← Back to Login" link
- [ ] OTP expired scenario shows clear resend message (not generic error)
- [ ] Nominatim reverse geocode failure → toast shown + manual search panel slides in
- [ ] Nominatim search failure → toast shown + input stays active (not disabled)
