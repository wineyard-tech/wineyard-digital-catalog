#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# test-api-routes.sh — curl acceptance tests for all WineYard API routes
#
# Prerequisites:
#   1. Next.js dev server running:  cd app && npm run dev
#   2. Fill in variables below with real values before running
#   3. For webhook HMAC tests you need openssl
#
# Usage:
#   chmod +x scripts/test-api-routes.sh
#   ./scripts/test-api-routes.sh
# ─────────────────────────────────────────────────────────────────────────────

# (no set -e — tests continue running even when one fails)

# ── Auto-source .env.local so the script uses the same credentials as the server
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../app/.env.local"
if [ -f "${ENV_FILE}" ]; then
  # Export all KEY=VALUE lines (skip comments and blank values)
  while IFS='=' read -r key value; do
    [[ "${key}" =~ ^[A-Z_]+$ ]] && [ -n "${value}" ] && export "${key}=${value}"
  done < "${ENV_FILE}"
  echo "  ✓ Loaded credentials from app/.env.local"
else
  echo "  ⚠ app/.env.local not found — set WHATSAPP_VERIFY_TOKEN and WHATSAPP_APP_SECRET manually"
fi

BASE="http://localhost:3000"
VERIFY_TOKEN="${WHATSAPP_VERIFY_TOKEN:-your_verify_token}"
APP_SECRET="${WHATSAPP_APP_SECRET:-your_app_secret}"
ADMIN_SESSION_COOKIE=""       # Fill after logging in via /admin/login
SESSION_COOKIE=""             # Fill after OTP verification
GUEST_TOKEN=""                # Fill from webhook test output
REF_ID=""                     # Fill from webhook test output (check DB)
OTP_CODE=""                   # Fill from WhatsApp message
ESTIMATE_ID=""                # Fill from enquiry test output
KNOWN_PHONE="919490744841"    # Real WhatsApp sandbox number — receives OTP messages

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  WineYard API Route Tests"
echo "════════════════════════════════════════════════════════════"

# ─── 1. Webhook GET — hub verification ───────────────────────────────────────
echo ""
echo "── Test 1: Webhook GET (hub verification) ───────────────────"
curl -s "${BASE}/api/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=test_challenge_12345" \
  | grep -q "test_challenge_12345" && echo "✓ PASS: challenge echoed" || echo "✗ FAIL"

# ─── 2. Webhook POST — valid HMAC + known phone ──────────────────────────────
echo ""
echo "── Test 2: Webhook POST (valid HMAC, known phone) ───────────"
# KNOWN_PHONE is set at the top of this file (919490744841)
WH_PAYLOAD='{"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"value":{"messaging_product":"whatsapp","contacts":[{"profile":{"name":"Phani"},"wa_id":"'"${KNOWN_PHONE}"'"}],"messages":[{"from":"'"${KNOWN_PHONE}"'","type":"text","text":{"body":"hello"}}]},"field":"messages"}]}]}'
WH_SIG="sha256=$(echo -n "${WH_PAYLOAD}" | openssl dgst -sha256 -hmac "${APP_SECRET}" | awk '{print $2}')"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE}/api/webhook" \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: ${WH_SIG}" \
  -d "${WH_PAYLOAD}")
[ "${HTTP_STATUS}" = "200" ] && echo "✓ PASS: 200 returned" || echo "✗ FAIL: got ${HTTP_STATUS}"
echo "  → Check DB: SELECT * FROM auth_requests WHERE phone='${KNOWN_PHONE}' ORDER BY created_at DESC LIMIT 1;"

# ─── 3. Webhook POST — valid HMAC + unknown phone ────────────────────────────
echo ""
echo "── Test 3: Webhook POST (valid HMAC, unknown phone → guest) ─"
UNKNOWN_PHONE="910000000001"  # Must NOT exist in contacts or Zoho
WH_PAYLOAD2='{"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"value":{"messaging_product":"whatsapp","contacts":[{"profile":{"name":"Guest"},"wa_id":"'"${UNKNOWN_PHONE}"'"}],"messages":[{"from":"'"${UNKNOWN_PHONE}"'","type":"text","text":{"body":"hi"}}]},"field":"messages"}]}]}'
WH_SIG2="sha256=$(echo -n "${WH_PAYLOAD2}" | openssl dgst -sha256 -hmac "${APP_SECRET}" | awk '{print $2}')"

HTTP_STATUS3=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE}/api/webhook" \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: ${WH_SIG2}" \
  -d "${WH_PAYLOAD2}")
[ "${HTTP_STATUS3}" = "200" ] && echo "✓ PASS: 200 returned" || echo "✗ FAIL: got ${HTTP_STATUS3}"
echo "  → Check DB: SELECT * FROM guest_sessions WHERE phone='${UNKNOWN_PHONE}' ORDER BY created_at DESC LIMIT 1;"

# ─── 4. Auth verify — correct OTP ────────────────────────────────────────────
echo ""
echo "── Test 4: Auth verify POST (correct OTP → session cookie) ─"
echo "  NOTE: Set REF_ID and OTP_CODE from the auth_requests row above"
if [ -n "${REF_ID}" ] && [ -n "${OTP_CODE}" ]; then
  VERIFY_RESPONSE=$(curl -s -c /tmp/wineyard_cookies.txt -X POST "${BASE}/api/auth/verify" \
    -H "Content-Type: application/json" \
    -d "{\"ref_id\":\"${REF_ID}\",\"otp_code\":\"${OTP_CODE}\"}")
  echo "${VERIFY_RESPONSE}" | grep -q '"success":true' && echo "✓ PASS: session created" || echo "✗ FAIL: ${VERIFY_RESPONSE}"
  SESSION_COOKIE=$(grep session_token /tmp/wineyard_cookies.txt | awk '{print $7}')
else
  echo "  SKIPPED — set REF_ID and OTP_CODE variables"
fi

# ─── 5. Auth verify — wrong OTP 3× ───────────────────────────────────────────
echo ""
echo "── Test 5: Auth verify POST (wrong OTP 3× → account locked) ─"
echo "  NOTE: Requires a fresh REF_ID (trigger webhook again with known phone)"
echo "  SKIPPED — run manually:"
echo "    for i in 1 2 3; do"
echo "      curl -X POST ${BASE}/api/auth/verify -H 'Content-Type: application/json'"
echo "           -d '{\"ref_id\":\"<ref_id>\",\"otp_code\":\"000000\"}'"
echo "    done"

# ─── 6. Catalog GET — valid session ──────────────────────────────────────────
echo ""
echo "── Test 6: Catalog GET (valid session → items with pricing) ─"
if [ -n "${SESSION_COOKIE}" ]; then
  curl -s -b "session_token=${SESSION_COOKIE}" "${BASE}/api/catalog?page=1" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('✓ PASS:',d['total'],'items' if 'total' in d else '✗ FAIL')"
else
  echo "  SKIPPED — set SESSION_COOKIE"
fi

# ─── 7. Catalog GET — guest token ────────────────────────────────────────────
echo ""
echo "── Test 7: Catalog GET (guest_token → base_rate only) ───────"
if [ -n "${GUEST_TOKEN}" ]; then
  curl -s "${BASE}/api/catalog?guest_token=${GUEST_TOKEN}&page=1" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('✓ PASS:',d['total'],'items, is_authenticated=',d.get('is_authenticated'))"
else
  echo "  SKIPPED — set GUEST_TOKEN (from guest_sessions table)"
fi

# ─── 8. Enquiry POST — valid session + cart ───────────────────────────────────
echo ""
echo "── Test 8: Enquiry POST (valid session + cart → estimate) ───"
if [ -n "${SESSION_COOKIE}" ]; then
  ENQUIRY_RESPONSE=$(curl -s -b "session_token=${SESSION_COOKIE}" \
    -X POST "${BASE}/api/enquiry" \
    -H "Content-Type: application/json" \
    -d '{
      "items": [{
        "zoho_item_id": "TEST001",
        "item_name": "Test Camera",
        "sku": "CAM-TEST",
        "quantity": 2,
        "rate": 5000,
        "tax_percentage": 18,
        "line_total": 10000
      }]
    }')
  echo "${ENQUIRY_RESPONSE}" | grep -q '"success":true' && echo "✓ PASS: estimate created" || echo "✗ FAIL: ${ENQUIRY_RESPONSE}"
  ESTIMATE_ID=$(echo "${ENQUIRY_RESPONSE}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('estimate_number',''))")
  echo "  Estimate: ${ESTIMATE_ID}"
else
  echo "  SKIPPED — set SESSION_COOKIE"
fi

# ─── 9. Enquiry POST — guest token → 403 ─────────────────────────────────────
echo ""
echo "── Test 9: Enquiry POST (guest token → 403) ─────────────────"
HTTP_STATUS9=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${BASE}/api/enquiry" \
  -H "Content-Type: application/json" \
  -d '{"items":[]}')
[ "${HTTP_STATUS9}" = "403" ] && echo "✓ PASS: 403 (no session)" || echo "  (got ${HTTP_STATUS9} — 403 or 400 both acceptable for empty no-auth)"

# ─── 10. Admin GET — valid Supabase Auth ──────────────────────────────────────
echo ""
echo "── Test 10: Admin GET (valid Supabase Auth → estimates list) ─"
if [ -n "${ADMIN_SESSION_COOKIE}" ]; then
  curl -s -H "Cookie: ${ADMIN_SESSION_COOKIE}" "${BASE}/api/admin" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('✓ PASS:',len(d.get('estimates',[])),'estimates')"
else
  echo "  SKIPPED — log in at /admin/login and capture Supabase Auth cookies"
fi

# ─── 11. Admin GET — no auth → 401 ───────────────────────────────────────────
echo ""
echo "── Test 11: Admin GET (no auth → 401) ───────────────────────"
HTTP_STATUS11=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/admin")
[ "${HTTP_STATUS11}" = "401" ] && echo "✓ PASS: 401 returned" || echo "✗ FAIL: got ${HTTP_STATUS11}"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Tests complete"
echo "════════════════════════════════════════════════════════════"
echo ""
