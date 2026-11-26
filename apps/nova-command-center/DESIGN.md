# NOVA Command Center — Design System

## Product and audience
NOVA Command Center is an authenticated operations console for an owner and authorized operators monitoring NOVA service health, a read-only MT5 bridge, risk policy visibility, approvals, and audit activity. Its primary job is to distinguish verified system state from unavailable, stale, or demo-only information.

## Design thesis
An operations instrument, not a trading terminal. Dense but calm telemetry, explicit provenance, and unmistakable safety boundaries take priority over decorative market graphics or speculative performance metrics.

## Visual language
- **Canvas:** deep graphite with a restrained blue-green undertone.
- **Primary signal:** signal teal for active navigation, verified healthy states, and focus.
- **Caution:** amber for SAFE MODE and degraded/unavailable conditions.
- **Failure:** red only for confirmed failures or access denial.
- **Surface hierarchy:** flat graphite panels, fine borders, limited elevation; avoid excessive glass effects and glow.
- **Signature:** a compact service-state matrix paired with a persistent safety rail. Each state includes text, not color alone.

## Tokens
The runtime source of truth is `src/styles.css` (Tailwind v4 theme variables).
- Background: existing `--background` / graphite oklch token.
- Foreground: existing `--foreground` token.
- Surface: existing `--card` token.
- Primary: existing signal-teal `--primary` token.
- Warning: existing amber `--warning` token.
- Destructive: existing `--destructive` token.
- Borders and focus: existing `--border` and `--ring` tokens.

Do not copy these values into component-local CSS. Change a durable color only in this stylesheet and update this document in the same changeset.

## Typography
- Product/UI text: Space Grotesk, sentence case.
- Telemetry, IDs, timestamps and compact status labels: JetBrains Mono.
- Use monospace for data, not for paragraphs or every heading.
- Numeric values use tabular numerals where supported.

## Layout
- Desktop: fixed-width navigation rail, flexible content canvas, compact utility header.
- Tablet/mobile: navigation becomes an accessible modal drawer; content stacks into one column.
- Content width is bounded for readability; data panels may use the full available width.
- Preserve document scrolling. Only explicitly bounded data regions may scroll internally.

## Components
- Reuse `components/nova/primitives.tsx` for Panel, Stat, StatusDot, EmptyState and PageHeader.
- Reuse the shared shadcn/Radix controls in `components/ui`.
- Reuse the shared Sonner Toaster for transient feedback.
- Reuse `SafetyBanner` and `lib/nova/safety.ts` as the safety source of truth.

## Motion and accessibility
- Motion is limited to subtle status indication; respect `prefers-reduced-motion`.
- All actions are semantic buttons or links with visible focus.
- Target WCAG 2.2 AA contrast and keyboard operation.
- Status must include readable text; never rely on color or animation alone.
- Keep touch targets comfortable on mobile and prevent sticky UI from obscuring focus.

## Content rules
- Never invent account balances, PnL, market prices, service uptime, broker connectivity, or model performance.
- Label synthetic fixtures as DEMO / SIMULATED.
- Use “Not connected”, “Unavailable”, “Checking”, and “Stale” precisely.
- A UI acknowledgement is not proof of backend execution or broker state.
