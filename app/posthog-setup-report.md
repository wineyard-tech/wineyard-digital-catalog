<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the WineYard Catalog Next.js app. The project already had a solid PostHog foundation (PostHogProvider, posthog-node server client, and several events). This integration extended it with new event tracking, improved the client-side initialization, added a reverse proxy, and set up a dashboard with five business-critical insights.

**Infrastructure changes:**
- `next.config.ts`: Added PostHog reverse proxy rewrites (`/ingest/*` → PostHog US servers) and `skipTrailingSlashRedirect: true`. Added a `NetworkOnly` workbox rule for `/ingest/` to prevent service worker caching of analytics calls.
- `src/components/analytics/PostHogProvider.tsx`: Updated PostHog init to use the reverse proxy (`api_host: '/ingest'`), added `defaults: '2026-01-30'`, `capture_exceptions: true` (error tracking), and `debug` mode in development.
- `app/.env.local`: Set `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`.

**New events added:**

| Event | Description | File |
|-------|-------------|------|
| `product_added_to_cart` | User adds a product from the catalog grid | `src/components/catalog/ProductCard.tsx` |
| `product_added_to_cart` | User adds a product from the product detail page | `src/components/product/ProductDetailClient.tsx` |
| `otp_requested` | User requests OTP for a registered account with catalog access | `src/app/auth/login/LoginClient.tsx` |
| `user_logged_in` | User successfully verifies OTP and is authenticated | `src/app/auth/verify/page.tsx` |
| `search_performed` | User types a search query in the catalog search bar | `src/components/catalog/SearchBar.tsx` |
| `buy_again_viewed` | Authenticated user with order history views the Buy Again page | `src/app/catalog/buy-again/page.tsx` |

**Existing events (already instrumented, not duplicated):**

| Event | File |
|-------|------|
| `product_viewed` | `src/components/product/ProductDetailClient.tsx` |
| `cart_viewed` | `src/components/cart/CartPage.tsx` |
| `cart_abandoned` | `src/components/cart/CartPage.tsx` |
| `quote_requested` | `src/components/cart/CartPage.tsx` |
| `estimate_created` | `src/app/api/enquiry/route.ts` (server-side) |
| `auth_failed` | `src/app/auth/login/LoginClient.tsx`, `src/app/auth/verify/page.tsx` |
| `$pageview` | `src/components/analytics/PostHogProvider.tsx` (all routes) |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/370905/dashboard/1434741

**Insights:**
- **Catalog-to-Quote Conversion Funnel** (add to cart → cart viewed → quote requested → estimate created): https://us.posthog.com/project/370905/insights/pe1n8ZuD
- **Quote & Estimate Volume** (daily quote requests vs confirmed estimates): https://us.posthog.com/project/370905/insights/iEcKrdQ7
- **Product View to Add-to-Cart Rate** (product_viewed vs product_added_to_cart): https://us.posthog.com/project/370905/insights/UdNiFIZV
- **OTP to Login Conversion Funnel** (otp_requested → user_logged_in): https://us.posthog.com/project/370905/insights/vp6fF9cl
- **Cart Viewed vs Cart Abandoned** (cart engagement vs churn signal): https://us.posthog.com/project/370905/insights/zvPIlo7J

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
