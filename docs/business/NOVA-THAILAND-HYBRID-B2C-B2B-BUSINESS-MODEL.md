# Thailand Hybrid B2C/B2B Business Model, Roadmap & Unit Economics

**Status:** Proposed planning baseline — not an approved price list or launch authorization  
**Decision owner:** VOOM_SYSTEM-NOVA-AI product owner  
**Last updated:** 2026-10-30  
**Canonical source:** `main` at `5de80ad4324e93843f6b1aaa3af9004230c81e05`  
**Tracking:** Issue #80; integration dependency Issue #78 / Draft PR #79

## 1. Confirmed business direction

| Dimension | Confirmed decision |
|---|---|
| Revenue model | Hybrid B2C + B2B |
| Initial geography | Thailand |
| Initial product scope | AI Analysis only |
| Broker access | Read-only; begin with Exness MT5 Demo |
| Execution | Not part of launch scope |
| Customer funds | NOVA does not custody, pool, transfer, or manage customer funds |
| Platform role | Software / analytics service, not a broker or execution venue |

The product is a **Trading Intelligence SaaS**: customers retain their own broker relationship and use NOVA for account-connected market data, AI-assisted analysis, research, and reporting. B2C subscriptions and B2B workspace licenses are the initial revenue streams.

This description is a product/business design, not a legal conclusion that any activity is outside financial-services regulation. Thai legal/compliance review is a mandatory pre-launch gate, particularly for personalized signals, investment recommendations, copy trading, or broker introductions.

## 2. Customer segments and value proposition

### B2C
- Self-directed retail traders in Thailand who already use MT5.
- Customers who want a consolidated read-only account view and explainable AI market analysis.
- Advanced users who want multi-timeframe research, strategy diagnostics, and usage history.

**Value proposition:** connect a supported account, see its verified read-only data, and receive structured analysis with source timestamps, model/version provenance, uncertainty, and explicit limitations.

### B2B
- Trading education/research teams and proprietary trading groups that need a shared analysis workspace.
- Introducing or customer-support teams only where the exact proposed activity is legally reviewed and permitted.
- Small firms that need organization-level seats, account workspaces, and auditable analytics.

**Value proposition:** a controlled multi-user analysis workspace with tenant isolation, role-based access, shared research views, usage controls, and organization-level reporting.

Do not market the initial product as a broker, managed account, guaranteed signal service, portfolio manager, or automated trading system.

## 3. Proposed packaging and price hypotheses

All prices below are **hypotheses for Thai customer interviews and controlled willingness-to-pay tests**. They are not verified market prices, approved charges, or commitments. Prices are in THB per month, before any applicable VAT or payment-provider charges.

| Plan | Proposed price | Intended scope |
|---|---:|---|
| Free | ฿0 | Product tour, limited public/sample analysis, no premium AI quota |
| B2C Pro | ฿599 | One supported read-only account, standard AI analysis quota, market dashboard, analysis history |
| B2C Premium | ฿1,490 | Up to three supported read-only accounts, higher analysis quota, advanced multi-timeframe reports and research views |
| B2B Team | ฿9,900 | Up to 10 seats and 10 connected read-only accounts, shared workspace, roles and organization usage report |
| B2B Enterprise | From ฿24,900; quote required | Negotiated seats/limits, dedicated support and optional private deployment discussion |

### Packaging rules
- Launch only the capabilities that are actually implemented, secured, supported by provider terms, and measured.
- Pro/Premium account limits and analysis quotas must be enforced server-side, not only hidden in the UI.
- B2B organization membership, roles, account ownership, and data visibility must be tenant-scoped and tested.
- Do not promise unlimited analysis, unlimited accounts, guaranteed accuracy, or a specific return.
- White-label brokerage, order execution, copy trading, performance fees, and custody are explicitly outside this plan.
- Do not activate paid checkout until entitlement, refund/cancellation, tax receipt, payment reconciliation, and webhook replay controls are implemented and tested.

## 4. Go-to-market: Thailand first

### Initial positioning
"AI-powered trading research and account analytics for traders who keep control of their own broker account."

### Acquisition channels to test
1. Educational content explaining market structure, multi-timeframe analysis, and risk concepts.
2. Closed beta cohort recruited from Thai MT5 trading communities, with clear research-only disclosures.
3. B2B discovery interviews with trading education/research teams and small trading groups.
4. Referral only after terms, disclosures, and any applicable IB/introducer obligations are reviewed.

### Validation before paid launch
- Conduct 20–30 structured B2C interviews and 5–10 B2B discovery interviews.
- Test the proposed ฿599 / ฿1,490 / ฿9,900 anchors; record willingness-to-pay, desired quota, trust concerns, and cancellation reasons.
- Run a time-limited closed beta with no charge or with a clearly disclosed pilot fee only after legal and payment review.
- Require real usage and retention evidence; sign-up interest alone is not product-market fit.

## 5. Product and engineering roadmap (12-month planning horizon)

Dates are relative to roadmap approval. Durations are estimates, not delivery promises. All implementation is based on the current repository and reviewed PRs; no direct commits to `main`.

| Stage | Indicative window | Product / engineering outcome | Dependencies and acceptance gate |
|---|---|---|---|
| M0 — Commercial validation & compliance | Weeks 0–4 | Interviews, price tests, Thai legal review scope, product disclosures, data/vendor cost inventory | Written product boundary; no unsupported investment-advice or broker claims |
| M1 — Secure customer onboarding | Months 1–3 | Complete Issue #78: provider registry, provider identity provenance, approved secret-vault design, self-service connect/verify/revoke, automated isolated MT5 tenant allocation | Vault decision; additive migration/RLS review; two-user owner/foreign-user tests; actual Exness Demo read-only verification |
| M2 — Analysis MVP | Months 2–4 | Account/market dashboard, data freshness, structured AI analysis, analysis history, model/version provenance and abstention states | Existing Hub and read-only Proxy reused; no duplicate gateway; source data verified; analysis quality and latency measured |
| M3 — B2C entitlement & billing | Months 3–5 | Free/Pro/Premium entitlement model, server-side quotas, checkout and webhook lifecycle, cancellation/refund support | Payment provider selected after fee/terms review; idempotent webhook tests; no secret exposure; entitlement/RLS tests |
| M4 — Thailand B2C closed beta | Months 4–6 | Limited cohort, support workflow, onboarding analytics, usage and cost metering | Security, legal, payment, provider and product gates pass; support and rollback plan ready |
| M5 — B2B Team workspace | Months 6–9 | Organization tenancy, seats/roles, shared analysis, account/workspace boundaries, B2B billing | Cross-organization denial tests; audit trail; support model; no cross-tenant data leakage |
| M6 — Scale and optimize | Months 9–12 | Cost-based quotas, reliability, monitoring, model quality dashboards, partner/API discovery | Actual COGS and retention evidence; positive contribution margin; vendor and capacity review |

### Existing repository alignment
- Frontend: `frontend/` Next.js; Netlify is the selected customer-facing target, subject to the repository's existing Preview/hosting gates.
- Control plane: existing Cloudflare System Integration Hub and MT5 read-only Proxy; extend these rather than creating a second gateway.
- Identity/data: Supabase Auth, `broker_connections`, and RLS; migrations must be additive and reviewed.
- Broker connector: existing Exness Demo Bridge/Relay path; Issue #78 tracks customer self-service identity and tenant provisioning gaps.
- AI/research: reuse registered analysis/research components. Heavy model training and historical simulation remain in separate Python jobs/runtime, not on a latency-sensitive Worker request path.
- Billing: no completed subscription/payment implementation was established in this repository review; treat it as new work after the analysis MVP and provider selection.

### Related work already in progress
- Issue #78 — self-service API identity verification and tenant provisioning (open).
- Draft PR #79 — design documentation for Issue #78; not runtime implementation and not merged.
- Existing delivery plan remains authoritative for security, staging, deployment, and read-only release gates.

## 6. Unit economics — illustrative planning model

The following is a transparent spreadsheet-style model for discussion. **None of these costs or conversion assumptions are measured from production usage.** Replace them with actual provider invoices, metered AI usage, support time, and payment statements before approving a price or scaling spend.

### 6.1 Base assumptions

| Input | Planning assumption | Evidence status |
|---|---:|---|
| Blended B2C paid ARPU | ฿599 / customer / month | Proposed price hypothesis |
| B2B Team ARPA | ฿9,900 / organization / month | Proposed price hypothesis |
| B2C variable cost | ฿120 / paid customer / month | Unverified placeholder: AI inference, data/compute allocation, storage and routine support |
| B2B variable cost | ฿1,800 / organization / month | Unverified placeholder: shared workspace compute, data/AI usage and routine support |
| B2C payment processing | 3% of B2C revenue | Placeholder only; provider/rail fees not selected or verified |
| Fixed operating platform cost — low | ฿25,000 / month | Unverified placeholder for baseline hosting, monitoring and operations tooling |
| Fixed operating platform cost — base | ฿35,000 / month | Unverified placeholder |
| Fixed operating platform cost — scale | ฿50,000 / month | Unverified placeholder |

The variable-cost placeholders do not establish the real cost of a continuously running MT5 terminal, Windows licensing, market-data redistribution, premium datasets, or customer-specific infrastructure. Measure those separately before offering high account limits.

### 6.2 Scenario model

Formula:

- Monthly revenue = (B2C paid customers × ฿599) + (B2B organizations × ฿9,900)
- B2C contribution/customer = ฿599 − ฿120 − (3% × ฿599) = **฿461.03**
- B2B contribution/organization = ฿9,900 − ฿1,800 = **฿8,100**
- Operating contribution before excluded costs = revenue − variable costs − assumed B2C payment fees − fixed platform cost

| Scenario | B2C paid | B2B orgs | Monthly revenue | Variable costs | B2C fee assumption | Fixed platform cost | Contribution after these costs |
|---|---:|---:|---:|---:|---:|---:|---:|
| Low | 50 | 2 | ฿49,750 | ฿9,600 | ฿898.50 | ฿25,000 | **฿14,251.50** |
| Base | 200 | 8 | ฿199,000 | ฿38,400 | ฿3,594 | ฿35,000 | **฿122,006** |
| Scale | 500 | 20 | ฿497,500 | ฿96,000 | ฿8,985 | ฿50,000 | **฿342,515** |

These are scenario calculations, not forecasts or net profit. They exclude founder/employee salaries, product development, marketing/acquisition, legal and compliance, tax/VAT, refunds/chargebacks, payment fixed fees, premium data licensing, insurance, financing, depreciation, and extraordinary support. Actual cloud/connector and AI costs may materially change the result.

### 6.3 Break-even method

At the assumptions above:

`Monthly contribution = 461.03 × B2C_paid + 8,100 × B2B_orgs`

Operational break-even occurs when:

`Monthly contribution ≥ fixed monthly operating cost`

Example using the low fixed-cost placeholder of ฿25,000:
- No B2B organizations: approximately 55 B2C Pro-equivalent paid customers are needed.
- Two B2B Team organizations contribute ฿16,200; approximately 20 additional B2C Pro-equivalent customers cover the remaining ฿8,800.

This is **platform operating break-even only**, before the excluded payroll, marketing, legal, tax, and development costs. A fully loaded break-even model must add those costs.

### 6.4 Pricing and cost gates
Do not approve final list prices until:
- 30–60 day beta usage provides actual AI cost per analysis and cost per active customer.
- Connector cost per active MT5 account and account uptime/maintenance cost are measured.
- Market-data terms and redistribution rights are confirmed.
- Payment fees, settlement timing, refunds, chargebacks, and tax handling are confirmed for the selected Thai payment provider.
- Customer support time and ticket rate are measured.
- Contribution margin remains positive under a high-usage customer stress test.

## 7. Metrics and decision gates

### Product and reliability
- Signup-to-first-analysis activation rate.
- Successful account connection and data-verification rate.
- Fresh-data percentage; stale/abstain rate.
- Analysis latency (p50/p95), availability, and failed-job rate.
- AI cost per completed analysis and per active paid customer.
- Support tickets per 100 active customers.

### Commercial
- Free-to-paid conversion.
- B2C and B2B MRR, ARPU/ARPA, gross margin and contribution margin.
- Monthly logo churn and paid retention by cohort.
- B2B seat activation and organization renewal.
- CAC and payback only after acquisition spend is measured.
- Refund/chargeback rate and payment failure recovery.

### Release / scale gates
1. Security: authenticated owner access and cross-user/cross-organization denial are proven; secrets are redacted; vault and tenant provisioning are operational.
2. Broker: fresh authenticated Exness Demo reads pass for the correct owner and isolated tenant.
3. AI: each result has timestamp, source, model/version, freshness and limitation metadata; stale or invalid inputs abstain.
4. Commercial: payment entitlements and cancellation/refund paths pass end-to-end tests.
5. Economics: actual measured unit costs support positive contribution margin at normal and stress usage.
6. Legal: Thai counsel review and required registrations/permissions are completed before public commercial launch.
7. Safety: read-only is enforced at the API/adapter boundary; `order_submission_enabled=false`; Live Trading OFF.

## 8. Risk register and mitigations

| Risk | Impact | Mitigation / gate |
|---|---|---|
| AI analysis is treated as regulated advice/signals | Regulatory and customer harm | Thai legal review; product wording and distribution review; clear limitations; no personalized recommendation until cleared |
| MT5 self-service onboarding is incomplete | Customers cannot reliably connect | Complete Issue #78; approved vault; idempotent tenant allocator; staging two-user test |
| Credential compromise or tenant leakage | Critical security incident | Server-only vault, least privilege, RLS, owner checks, redaction, rotation/revoke, penetration/security review |
| Per-account Cloud Connector cost exceeds plan | Negative unit economics | Meter actual per-account cost; quotas; shared/isolated node design justified by measured load |
| Market-data license/redistribution restrictions | Legal cost or product limitation | Review broker/provider terms and data rights before commercial display or redistribution |
| AI/model quality is overstated | Trust and reputational harm | Publish methodology/uncertainty; no guaranteed-return claims; use independent validation; abstain on stale/invalid inputs |
| Payment provider fees or disputes | Margin and cash-flow pressure | Obtain Thai provider quote; test webhooks, refunds and reconciliation |
| B2B cross-tenant exposure | Critical data breach | Organization-level RLS and explicit two-organization denial tests |
| Hosting/provider dependency | Availability and cost risk | Document provider limits, backups/rollback, and portability without introducing unmeasured services |

## 9. Explicitly out of scope

- Broker/dealer or white-label brokerage operation.
- Holding, pooling, transferring, or withdrawing customer money.
- Trade execution, order placement/modification/cancellation, position mutation, copy trading, or live automation.
- Profit-sharing or performance-fee revenue.
- Promises of returns, accuracy, win rate, or guaranteed signals.
- MetaApi, B2BROKER, or Quadcode purchase/integration as a prerequisite for this business model.
- Production configuration changes or deployment authorization.

## 10. Immediate next actions

1. Review this commercial baseline and confirm or revise the proposed price hypotheses.
2. Continue Issue #78 / PR #79 to complete secure self-service onboarding and MT5 tenant isolation.
3. Build a measured read-only Analysis MVP on the existing Hub/Proxy architecture.
4. Select and implement a Thai-capable payment provider only after fee, terms, refund, tax, and webhook review.
5. Run a closed beta, measure actual unit costs, and only then set public pricing and B2B contract terms.

**Safety invariant:** Exness Demo only for the initial MT5 rollout; Read-only + AI Analysis; broker order submission disabled; Live Trading OFF. This document is planning only and does not authorize production activation or trading capability.
