# NOVA Wix Dashboard Integration

## Source

- Archived Wix export: `frontend/wix-export.html`
- Source page: `https://suwapat787.wixsite.com/voom-system`
- Export size at review: approximately 1.15 MB.
- The export is a Wix Thunderbolt viewer document, not a reusable React component or standalone static page.

## Integration decision

Do not embed the exported HTML, scripts, CSS, or Wix runtime into the Next.js application. The export depends on Wix viewer globals, Thunderbolt bundles, Wix component IDs, remote static assets, and Wix navigation/session behavior. Embedding it would create a second application runtime and bypass the existing Next.js/Supabase/Cloudflare integration.

The useful dashboard concepts were migrated into native Next.js JSX and the existing NOVA HUD design system in `frontend/app/page.jsx` and `frontend/app/globals.css`.

## Migrated concepts

| Wix concept | NOVA implementation |
| --- | --- |
| Market watchlist | Existing NOVA market watchlist, with unverified-feed labels |
| Equity trend | Existing illustrative chart, explicitly watermarked as non-live |
| AI confidence and rationale | New research card with an empty state until a validated engine result exists |
| Portfolio / risk metrics | New empty-state metrics; no synthetic account values |
| Emergency close / kill switch | Not implemented. Order execution remains locked and there is no close-all action |
| Portfolio allocation | New empty state until owner-scoped verified portfolio data is available |
| Activity / telemetry | New status panel; explicitly reports frontend-observed state, not server logs |

## Data integrity and safety rules

- Do not copy sample Wix values (94.8%, +124.5%, -8.2%, 68.4%, 2.45, exposure 12.55x, average position 0.450 BTC, or $1,200 daily loss limit) into production-facing metrics.
- Never label illustrative chart data as live market data.
- Do not render a signal, confidence score, portfolio balance, allocation percentage, or risk metric without a verified source and timestamp.
- Do not add order submission, position-closing, kill-switch, or live-trading behavior from the static export.
- Keep Supabase authentication, broker ownership checks, API routes, and the read-only / Demo boundary unchanged.
- Treat telemetry shown in the browser as UI-observed status only; server logs must come from a dedicated authenticated backend source.

## Acceptance checks

- Next.js production build and Cloudflare OpenNext build.
- Responsive layout at desktop, tablet, and mobile widths.
- Verify empty states remain visible when market, AI, and portfolio feeds are unavailable.
- Confirm no Wix runtime script, Wix API, external iframe, or exported static HTML is loaded by the Next.js page.
- Confirm no order action is exposed and the existing broker status request remains unchanged.

## Rollout

This change is isolated on a feature branch and must pass exact-head Frontend CI before review. It does not deploy the public Netlify site, stable Cloudflare Worker, or change DNS.
