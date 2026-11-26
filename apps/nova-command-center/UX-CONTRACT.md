# NOVA Command Center — UX Contract

## 1. Authority and safety
- The browser is an untrusted presentation layer. The Cloudflare Worker is authoritative for authentication, role enforcement, and resource access.
- Role claims are read from server-issued `app_metadata.nova_role`; missing or unknown roles fail closed.
- UI role visibility is advisory only and must never be described as server authorization.
- Default mode is authenticated, read-only operations. No frontend action may place, modify, or close broker orders; move funds; mutate broker accounts; or enable Live Trading.
- Safety constants in `src/lib/nova/safety.ts` are immutable. UI state cannot override them.
- The emergency-stop control, if shown, must say it is unavailable/not connected until an authenticated backend response confirms the action. Never report success from a local click.

## 2. Navigation and shell
- Primary navigation routes: Overview, AI Assistant, Trading, MT5 Bridge, Risk Center, Approvals, Users & Roles, Audit Logs, Settings.
- Navigation uses TanStack Router links and a single active-route treatment.
- Desktop uses a persistent navigation rail; mobile uses an accessible modal navigation drawer.
- Drawer closes on route selection, close button, Escape, and backdrop interaction; focus returns to its trigger.
- Sign-out clears the Supabase session and routes to Login. Pending navigation or request state must not imply sign-out succeeded before the auth call resolves.
- Header identity and role are display metadata. Do not expose secrets or tokens.

## 3. Overview data behavior
- API health, service registry, bridge status, and auth configuration are independent data sources. One failure must not erase successful results from another.
- API health refresh target: 15 seconds. Service and bridge refresh target: 30 seconds.
- Display source state and freshness honestly. Do not infer bridge readiness from API health.
- A bridge heartbeat is not proof of account identity, data completeness, or execution readiness.
- No account balances, PnL, market prices, trade counts, or model metrics may be displayed unless returned by a verified API contract.
- Unknown or missing values render as “Not connected” or “Unavailable”, not zero.

## 4. Async state matrix
Every data-backed panel supports:
- **Initial loading:** stable skeleton/placeholder geometry; announce progress where meaningful.
- **Success:** show verified data and its status text.
- **Empty:** explain which source returned no records and what configuration or action would populate it.
- **Error:** show a concise cause category and a retry action when retry is safe.
- **Partial failure:** preserve successful sibling panels and show an inline error only in the affected panel.
- **Stale:** retain last known data only with a visible stale/freshness label; never present it as current.
- **Not configured:** explain the missing configuration without retry loops.

## 5. Actions and feedback
- Refresh is read-only, idempotent, and scoped to NOVA query keys. Disable duplicate refresh while the request is pending.
- Links navigate; buttons perform actions. No clickable non-semantic containers.
- Use shared Sonner notifications for transient confirmations. Critical status remains visible inline.
- Do not use browser alert/confirm/prompt.
- Destructive, permission-changing, costly, or irreversible operations require an accessible confirmation flow; such operations are not part of the read-only overview.

## 6. Forms and sensitive data
- Use shared field and validation primitives where forms exist.
- Associate labels, help text, and errors programmatically. Preserve entered values after validation failure.
- Mask credentials and tokens by default. Never put secrets in URLs, logs, toasts, or analytics.
- Prevent duplicate submissions and retain button dimensions during pending state.
- Warn before losing unsaved changes.

## 7. Tables and datasets
- Tables must have a defined paging or bounded-scroll strategy, semantic headers, accessible sort controls, and loading/empty/error/partial-error states.
- Filter, sort, page and page-size state must be restorable where shareable and non-sensitive.
- Clamp/reset pagination after filters or deletion.
- Do not add a table to a workflow that does not need tabular comparison.

## 8. Localization
- Current product locale: English (`en`); Thai copy may be introduced only with a consistent locale policy.
- Use locale-aware date/time and number formatting; timestamps from APIs are UTC unless the API contract says otherwise.
- Do not hard-code local timezone assumptions into persisted timestamps.

## 9. Responsive and accessibility
- Target WCAG 2.2 AA.
- Keyboard users can reach every action and see focus; dialogs manage focus and restore it on close.
- Icon-only actions have accessible names.
- At narrow widths, cards stack, labels remain readable, and navigation remains operable without horizontal page overflow.
- Respect reduced motion and forced-colors settings.
- Focus is never obscured by sticky navigation or mobile browser UI.

## 10. Verification contract
Before release, run the app's declared checks: typecheck, lint, unit tests, production build. Exercise success, loading, empty, error, partial failure, keyboard navigation, drawer open/close, and one narrow viewport in a real browser. Verify that safety tests remain green and inspect exact-head CI. Static inspection alone is not proof of runtime behavior.

## 11. Explicitly unresolved
- Backend deployment and live service availability are not established by the frontend.
- Supabase production migration is not authorized by this contract.
- Broker writes, order placement, funds movement, and Live Trading remain disabled.
