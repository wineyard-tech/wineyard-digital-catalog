# WineYard Digital Catalog - Phone + WhatsApp OTP Auth Implementation

## 1. CONTEXT

You are implementing phone-based authentication with WhatsApp OTP for a B2B CCTV distributor platform. The system has two user types:

- **Registered integrators**: Active customers in Zoho Books, synced to Supabase. Get full access with custom pricing.
- **Unregistered users**: Not in the system. Can browse catalog with general pricing only. Login attempts are captured as leads and alert admin via WhatsApp.

**Tech Stack:**
- Frontend: Next.js 15 (App Router) on Vercel
- Backend + Auth + Database: Supabase
- OTP Delivery: WhatsApp Business API (WABA) - already configured
- System of Record: Zoho Books (synced via webhooks + daily batch)

**Critical Constraints:**
- DO NOT query Zoho APIs for auth - all data is in Supabase via sync
- Session duration: 15 days (refresh token: 30 days)
- OTP valid for: 10 minutes
- Alert admin on unregistered login attempts via WhatsApp

---

## 2. DOMAIN - File Structure

### CAN TOUCH (create/modify):
```
/app/auth/                    # Auth pages and flows
/app/api/auth/                # Auth API routes
/lib/auth/                    # Auth utilities and helpers
/lib/whatsapp/                # WhatsApp OTP service
/components/auth/             # Auth UI components
/hooks/useAuth.ts             # Auth state management hook
/middleware.ts                # Route protection middleware
```

### DO NOT TOUCH:
```
/app/catalog/                 # Existing catalog pages
/app/cart/                    # Existing cart logic
/lib/zoho/                    # Zoho sync jobs (already implemented)
/lib/supabase/sync/           # Webhook handlers (already implemented)
```

### MUST USE (existing):
```
/lib/supabase/client.ts       # Supabase client initialization
/lib/env.ts                   # Environment variable validation
```

---

## 3. TASK LIST

### 3.1 Database Schema Setup

Create/verify the following Supabase tables:

**Table: `auth_attempts`**
Track all login attempts for debugging and lead capture.
```
Columns:
- id (uuid, primary key)
- phone_number (text, not null)
- attempt_type (enum: 'registered_success' | 'registered_failed' | 'unregistered')
- ip_address (text, nullable)
- user_agent (text, nullable)
- created_at (timestamptz, default now())
- metadata (jsonb, nullable) - store any additional context

Indexes:
- phone_number (for lookup)
- created_at (for time-based queries)
- attempt_type (for filtering)
```

**Table: `otp_sessions`**
Temporary OTP storage with expiry.
```
Columns:
- id (uuid, primary key)
- phone_number (text, not null)
- otp_code (text, not null) - hashed, never store plaintext
- expires_at (timestamptz, not null)
- attempts (integer, default 0) - track verification attempts
- verified (boolean, default false)
- created_at (timestamptz, default now())

Indexes:
- phone_number + expires_at (for active OTP lookup)

TTL Policy:
- Auto-delete rows where expires_at < now() - 1 hour
```

**Verify existing: `contacts` table**
Ensure these columns exist (synced from Zoho):
- zoho_contact_id (text, unique, not null)
- phone (text, unique, not null)
- contact_name (text)
- status (enum: 'active' | 'inactive')
- company_name (text, nullable)
- synced_at (timestamptz)

**Row Level Security (RLS):**
- Enable RLS on all tables
- `auth_attempts`: Service role only (no user access)
- `otp_sessions`: Service role only
- `contacts`: Authenticated users can read their own contact record only

---

### 3.2 Environment Variables

Add to `.env.local` and document in `.env.example`:

```
# WhatsApp Business API
WABA_PHONE_NUMBER_ID=         # Your WABA phone number ID
WABA_ACCESS_TOKEN=            # Meta API access token
WABA_TEMPLATE_NAME=           # OTP template name (e.g., "wineyard_otp")

# Admin Alerts
ADMIN_WHATSAPP_NUMBER=        # Admin number for unregistered alerts (format: 919876543210)

# Supabase (should already exist)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # For admin operations

# App Config
NEXT_PUBLIC_APP_URL=          # For redirect URLs
OTP_EXPIRY_MINUTES=10         # Optional, default 10
MAX_OTP_ATTEMPTS=3            # Optional, default 3
```

---

### 3.3 WhatsApp OTP Service

Create `/lib/whatsapp/otp-service.ts`:

**Functions to implement:**
1. `sendOTP(phoneNumber: string, otpCode: string): Promise<{success: boolean, messageId?: string, error?: string}>`
   - Send OTP via WABA template message
   - Template variables: OTP code
   - Return Meta API message ID for tracking

2. `sendUnregisteredAlert(phoneNumber: string, timestamp: Date): Promise<void>`
   - Send alert to admin number
   - Format: "Unregistered login attempt: +91-XXXXX-XXXXX at [timestamp]"
   - Non-blocking (don't fail auth flow if this fails)

**Error Handling:**
- Log all WABA API failures
- Return structured error responses
- Implement retry logic (max 2 retries with exponential backoff)

---

### 3.4 Auth API Routes

Create Next.js API routes:

#### `/app/api/auth/send-otp/route.ts` (POST)

**Request Body:**
```typescript
{
  phoneNumber: string  // E.164 format (e.g., "+919876543210")
}
```

**Logic:**
1. Validate phone number format (Indian mobile: +91 followed by 10 digits)
2. Check `contacts` table for phone number
3. If found AND status='active':
   - Generate 6-digit OTP (cryptographically random)
   - Hash and store in `otp_sessions` (expires_at = now + 10 minutes)
   - Send OTP via WhatsApp
   - Log attempt in `auth_attempts` (type: 'registered_success')
   - Return: `{success: true, registered: true, expiresIn: 600}`
4. If NOT found OR status='inactive':
   - Log attempt in `auth_attempts` (type: 'unregistered')
   - Send alert to admin via WhatsApp (non-blocking)
   - Return: `{success: true, registered: false, message: "Please contact WineYard to register"}`

**Response Status:**
- 200: Request processed (check `registered` field)
- 400: Invalid phone format
- 429: Rate limit exceeded (max 3 requests per phone per 5 minutes)
- 500: Server error

**Rate Limiting:**
- Max 3 OTP requests per phone number per 5 minutes
- Track in `otp_sessions` table by counting recent entries

---

#### `/app/api/auth/verify-otp/route.ts` (POST)

**Request Body:**
```typescript
{
  phoneNumber: string,
  otpCode: string
}
```

**Logic:**
1. Lookup active OTP session (phone_number, expires_at > now, verified = false)
2. If not found: Return error "OTP expired or invalid"
3. If found:
   - Verify hashed OTP matches
   - Increment `attempts` counter
   - If attempts > 3: Invalidate session, return error "Too many attempts"
   - If OTP correct:
     - Mark session as verified
     - Get contact record from `contacts` table
     - Create/update Supabase Auth user (phone as identifier)
     - Generate JWT session (15-day expiry)
     - Log in `auth_attempts` (type: 'registered_success')
     - Return: `{success: true, session: <session_object>, user: <user_metadata>}`
   - If OTP incorrect:
     - Log in `auth_attempts` (type: 'registered_failed')
     - Return: `{success: false, attemptsLeft: 3 - attempts}`

**User Metadata to Store:**
Store in Supabase Auth `user_metadata`:
```typescript
{
  zoho_contact_id: string,
  contact_name: string,
  company_name: string,
  phone: string,
  status: 'active' | 'inactive'
}
```

**Response Status:**
- 200: Verification processed (check `success` field)
- 400: Invalid input
- 401: OTP incorrect
- 500: Server error

---

#### `/app/api/auth/refresh/route.ts` (POST)

**Logic:**
- Use Supabase refresh token to generate new access token
- Re-fetch latest contact metadata from `contacts` table
- Update user_metadata if contact details changed
- Return new session

---

#### `/app/api/auth/logout/route.ts` (POST)

**Logic:**
- Invalidate Supabase session
- Clear client-side cookies/storage
- Return success

---

### 3.5 Frontend Auth Components

#### `/components/auth/PhoneInput.tsx`
- Phone number input with +91 prefix (Indian format)
- Validation: 10-digit mobile number
- Format as user types: +91-XXXXX-XXXXX
- Submit button: "Send OTP"
- Loading state during API call

#### `/components/auth/OTPInput.tsx`
- 6-digit OTP input (separate boxes for each digit)
- Auto-focus next box on input
- Submit button: "Verify"
- Countdown timer (10 minutes)
- "Resend OTP" button (disabled until 30 seconds elapsed)
- Show attempts remaining on incorrect OTP

#### `/components/auth/UnregisteredMessage.tsx`
- Display when user is not registered
- Message: "You are not registered with WineYard. Please contact us to create an account."
- WhatsApp CTA button: "Contact on WhatsApp" (opens WineYard business number)
- Secondary CTA: "Browse Catalog" (redirect to browse mode)

---

### 3.6 Auth Pages

#### `/app/auth/login/page.tsx`
- Render PhoneInput component
- On submit → call `/api/auth/send-otp`
- If `registered: true` → navigate to OTP page
- If `registered: false` → show UnregisteredMessage component

#### `/app/auth/verify/page.tsx`
- Render OTPInput component
- Pre-fill phone number from query param or state
- On submit → call `/api/auth/verify-otp`
- On success → redirect to dashboard/home
- On failure → show error, allow retry

#### `/app/auth/browse/page.tsx` (Unregistered Access)
- Redirect to catalog with browse mode flag
- Show banner: "Browsing with general pricing. Register for custom rates."
- Restrict: No cart, no estimates, no orders
- Allow: View catalog, search, view product details

---

### 3.7 Auth Hooks & State Management

#### `/hooks/useAuth.ts`
```typescript
// Expose these functions and state:
- user: User | null
- session: Session | null
- loading: boolean
- isAuthenticated: boolean
- isRegistered: boolean  // true if user has zoho_contact_id in metadata
- sendOTP(phoneNumber: string): Promise<{registered: boolean}>
- verifyOTP(phoneNumber: string, otp: string): Promise<void>
- logout(): Promise<void>
- refreshSession(): Promise<void>
```

Use Supabase Auth client methods. Subscribe to `onAuthStateChange` for real-time session updates.

---

### 3.8 Middleware & Route Protection

#### `/middleware.ts`
Protect routes based on auth status:

**Public Routes (no auth required):**
- `/auth/*` - all auth pages
- `/browse/*` - unregistered catalog browsing
- `/` - landing page

**Protected Routes (require auth):**
- `/catalog/*` - full catalog with custom pricing
- `/cart/*` - cart and checkout
- `/orders/*` - order history
- `/profile/*` - user profile

**Middleware Logic:**
1. Check Supabase session validity
2. If session exists:
   - Verify user_metadata contains `zoho_contact_id` (registered user)
   - Allow access to protected routes
3. If no session:
   - Redirect to `/auth/login`
4. If session exists but no `zoho_contact_id`:
   - Treat as anomaly (should not happen)
   - Force logout and redirect to login

---

### 3.9 Session Management

**Client-side:**
- Store session in Supabase Auth (handles cookies automatically)
- No manual JWT handling required
- Use `supabase.auth.getSession()` on app load
- Subscribe to `onAuthStateChange` for logout detection

**Server-side (API routes):**
- Validate session using Supabase service role client
- Extract user metadata from JWT
- Refresh session if < 24 hours until expiry

**Expiry Handling:**
- Access token: 15 days
- Refresh token: 30 days
- Auto-refresh on page load if < 24 hours remaining
- Show "Session expired" modal if refresh fails → redirect to login

---

## 4. ACCEPTANCE CRITERIA

### 4.1 Registered User Flow
- [ ] User enters phone → OTP sent within 3 seconds
- [ ] OTP arrives on WhatsApp with correct template format
- [ ] User enters correct OTP → logged in, redirected to catalog
- [ ] User enters wrong OTP → error shown, 2 attempts remaining
- [ ] User exceeds 3 attempts → OTP invalidated, must request new OTP
- [ ] Session persists for 15 days without re-auth
- [ ] User can logout manually → session cleared

### 4.2 Unregistered User Flow
- [ ] User enters unregistered phone → "Not registered" message shown
- [ ] Admin receives WhatsApp alert within 10 seconds
- [ ] Alert format: "Unregistered login attempt: +91-XXXXX-XXXXX at [timestamp]"
- [ ] User can click "Browse Catalog" → redirect to browse mode
- [ ] Browse mode shows general pricing (no custom rates)
- [ ] Browse mode hides cart, checkout, order buttons

### 4.3 Error Handling
- [ ] Invalid phone format → clear error message
- [ ] WhatsApp delivery failure → retry twice, then show "OTP failed to send"
- [ ] Expired OTP → clear message, allow resend
- [ ] Rate limit exceeded → show "Too many attempts, try after X minutes"
- [ ] Network errors → graceful fallback, retry option

### 4.4 Security
- [ ] OTP stored as hash, never plaintext
- [ ] OTP expires after 10 minutes
- [ ] Rate limiting: Max 3 OTP requests per phone per 5 minutes
- [ ] Max 3 verification attempts per OTP session
- [ ] All API routes validate phone format
- [ ] Supabase RLS policies active on all tables
- [ ] No Zoho credentials in client-side code
- [ ] Session tokens use secure, httpOnly cookies

### 4.5 Data & Logging
- [ ] All login attempts logged in `auth_attempts` table
- [ ] Successful logins include IP and user agent
- [ ] Unregistered attempts captured with timestamp
- [ ] OTP sessions auto-deleted after expiry + 1 hour
- [ ] Admin alerts logged for audit trail

### 4.6 UX & Performance
- [ ] Phone input auto-formats as user types
- [ ] OTP input auto-focuses next digit box
- [ ] Countdown timer shows remaining seconds
- [ ] Loading states on all buttons
- [ ] Error messages are user-friendly (no technical jargon)
- [ ] "Resend OTP" disabled for 30 seconds after send
- [ ] Mobile-responsive on Android (primary platform)

### 4.7 Integration
- [ ] Auth hooks work with existing catalog pages
- [ ] User metadata (name, company) displayed in UI
- [ ] Custom pricing fetched based on zoho_contact_id
- [ ] Session persists across page reloads
- [ ] Middleware protects all sensitive routes
- [ ] Logout clears all client-side state

---

## IMPLEMENTATION NOTES

**OTP Generation:**
Use cryptographically secure random (e.g., `crypto.randomInt(100000, 999999)` in Node.js). Never use `Math.random()`.

**Hashing OTP:**
Use bcrypt or similar before storing in database. Verify with `bcrypt.compare()`.

**WhatsApp Template Approval:**
Ensure WABA template is pre-approved by Meta. Template format:
```
Category: AUTHENTICATION
Language: English
Body: "Your WineYard login OTP is {{1}}. Valid for 10 minutes. Do not share."
```

**Phone Number Format:**
Always store in E.164 format: `+919876543210`. Strip spaces/hyphens before API calls.

**Testing:**
- Use a test phone number for OTP testing (log OTP to console in dev mode)
- Mock WhatsApp API in test environment
- Test rate limiting with multiple rapid requests
- Verify session expiry with manual time adjustments

**Deployment:**
- Add all env vars to Vercel project settings
- Test on staging with real WABA credentials
- Monitor WABA quota (WhatsApp has monthly limits)
- Set up alerts for auth failure spikes

---

## DEPENDENCIES TO INSTALL

```bash
npm install bcryptjs
npm install @types/bcryptjs --save-dev
```

Do NOT install additional WhatsApp libraries. Use native `fetch()` to call Meta Graph API.

---

## QUESTIONS FOR CLARIFICATION

Before starting implementation, confirm:
1. Is the `contacts` table structure accurate? (Check column names match Zoho sync)
2. Do you have the WABA template name and phone number ID ready?
3. Should unregistered users be able to save favorites/wishlists, or strictly read-only?
4. Any specific brand colors or design system for auth pages? (Or use existing catalog theme)

---

END OF PROMPT
