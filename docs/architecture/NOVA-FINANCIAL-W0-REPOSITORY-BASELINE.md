# NOVA Financial Engine — W0 Repository and Schema Baseline

**Date:** 2026-10-31  
**Status:** W0 repository baseline recorded; implementation and hosted mutations are not authorized  
**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Base:** `main`  
**Exact inspected base SHA:** `a2acfd8ec9b598e6593413549bef760e8f596a72`  
**Master tracker:** [Issue #36](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/issues/36)  
**Existing commercial architecture:** [Draft PR #129](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/129)  
**Existing schema/API audit:** [Draft PR #131](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/131)  
**Permanent approval dependency:** [PR #67](https://github.com/vutting895/VOOM_SYSTEM-NOVA-AI/pull/67)

## 1. Owner-confirmed scope

- Platform finance for VOOM and tenant-level commerce/finance, with strict separation between platform billing and each tenant's merchant activity.
- Tax and document workflows for VOOM and tenant businesses. Each issuer must have its own verified legal/tax identity and eligibility; a tenant workspace alone does not grant authority to issue tax documents.
- Multi-Gateway architecture. No provider is selected or connected by this baseline.
- PromptPay QR and Google Pay are requested payment methods, not verified capabilities of a connected merchant account.
- Real-money payment, refund, payout, subscription collection and production document issuance remain disabled until separately approved and verified.

## 2. Repository baseline and existing work to reuse

The Git ref for `main` was read directly and resolves to `a2acfd8ec9b598e6593413549bef760e8f596a72`. The repository default branch is `main`.

### Existing architecture

- Draft PR #129 defines the NOVA Marketing & Sales domain, including one-time, recurring and usage-based commerce, order/payment-event/subscription/entitlement concepts, tenant boundaries and human approval gates.
- PR #129 explicitly does not authorize a payment processor/account, custody of customer funds, production payment configuration or deployment. It is an architecture proposal, not a payment implementation.
- Draft PR #131 contains a read-only Production/Staging schema, migration-ledger, RLS/grant, API and approval audit. Reuse this evidence; do not repeat its broad W0 inventory or create another master tracker.
- Issue #36 remains the sole Master Tracker. Existing automation is retained; no new tracker or automation is created.
- PR #67 remains a permanent dependency, but its current approval lifecycle is strategy-draft/owner-scoped and is not a generic finance approval API.

### Existing main-branch schema and code observations

- PR #131's exact-main audit reports four SQL migration files on main, seven Next.js API route handlers, and no existing payment, order, subscription-billing or payment-webhook schema/routes on the inspected SHA.
- Repository code searches for PromptPay, Google Pay, payment gateway/webhook/checkout, invoice/receipt/tax/VAT/e-Tax and accounting ledger/journal/debit-credit returned no matching implementation.
- The inspected `frontend/package.json` declares Next.js and Supabase dependencies; no payment SDK is declared in its dependencies.
- These search results are evidence of no identified implementation in the inspected source, not proof that no external provider account or configuration exists.

## 3. Supabase evidence and hard blockers

The existing PR #131 read-only audit reports:

- Production: 24 migration history entries and 19 public tables.
- Staging: 2 migration history entries and 8 public tables.
- Main: four SQL migration files.
- Migration names/version identifiers do not align consistently across main, Production and Staging.
- PR #67 approval schema is present in Staging but absent from Production.
- Staging has five RLS-enabled tables without policies and broad anon/authenticated grants; legacy `user_brokers` contains secret-like columns and must not be reused.

**Hard stop:** Do not run `db push`, apply/replay/repair/reset migrations, create hosted schema objects, alter grants/policies, or create a paid Supabase branch until the migration source/history reconciliation is completed, reviewed and explicitly approved. Do not infer that similarly named migrations are equivalent.

No hosted database changes were made by this W0.

## 4. Finance domain boundaries to preserve

1. **Platform billing:** VOOM as SaaS provider charging its own customers/tenants.
2. **Tenant commerce:** each tenant as a separate seller/merchant for its own end customers, orders, payments and tax documents.
3. **Payment orchestration:** provider-neutral payment intent, provider adapter, verified event inbox, deduplication, refund intent and reconciliation. A browser redirect or uploaded slip is not payment proof.
4. **Accounting:** immutable, balanced double-entry postings; reversals/corrections instead of editing posted entries; separate receivable/payable, cash/clearing, fees, refunds and tax control accounts.
5. **Tax/document issuance:** issuer-specific tax identity, VAT registration/status, branch/address, tax treatment, document numbering, correction documents, signature and delivery evidence. Do not assume every tenant can issue e-Tax documents.
6. **Approval:** reuse existing approval infrastructure only through a reviewed, typed extension; do not broaden PR #67's strategy request type or create a second generic approval engine.

## 5. Required Finance W0 evidence still to collect

- Exact inventory of any existing finance-related source files, configuration names, storage paths, event/outbox/idempotency helpers, audit patterns and CI path filters beyond the initial code search.
- A file-by-file reuse/extend/new/defer matrix against PR #129 and PR #131.
- A read-only migration source/ledger reconciliation report, or an explicit dependency link to the canonical report once completed. Do not repeat the same Production/Staging schema inspection.
- Thai tax/accounting policy decision matrix for platform vs tenant issuer, VAT registration/status, tax-inclusive/exclusive pricing, tax point, withholding tax where applicable, receipt/tax-invoice/credit-note/debit-note rules, e-Tax eligibility, signature and retention.
- Gateway capability matrix verified against current provider documentation and merchant eligibility for Thailand, THB, PromptPay, Google Pay, cards, recurring payments, refunds, settlement reports, webhook signing/replay and idempotency.
- Merchant-of-record and settlement/funds-flow decision: who contracts with the payment provider, who receives settlement, who bears fees/refunds/chargebacks and who issues the tax document.

## 6. Safety and non-effects

This is a repository/schema baseline only. It does not:
- add application code, SQL migrations, database objects, grants, policies, triggers, functions or rows;
- connect or configure a payment/tax provider or store provider credentials;
- create checkout sessions, charge, refund, transfer or settle money;
- issue legal tax invoices or claim e-Tax registration/approval;
- change Cloudflare, Netlify, DNS, Workers, deployments or production configuration;
- enable broker order submission or Live Trading.

**Activation invariants:** live payment OFF; refunds OFF; provider connections not configured; production tax issuance OFF; broker read-only posture unchanged; order submission and Live Trading OFF.

## 7. W0 exit criteria

- [x] Confirm canonical repository, default branch and exact main SHA.
- [x] Read the canonical NOVA delivery/verification/activation plan.
- [x] Identify the sole Master Tracker and preserve existing automation.
- [x] Identify and reuse the existing commercial architecture and Supabase schema/API audit; avoid duplicate W0 work.
- [x] Confirm no matching payment/tax/accounting implementation in the initial source searches.
- [x] Record owner-confirmed scope and hard safety gates.
- [ ] Complete the Finance-specific source/config/event/reuse inventory.
- [ ] Complete provider capability and Thai tax/accounting decision matrices from current authoritative sources.
- [ ] Review the Finance W0 baseline with the owner before any implementation proposal.
- [ ] Only after review, propose a separate implementation sequence and tests on a feature branch from then-current main.

**Disposition:** Repository baseline is recorded; Finance W0 remains in progress. No implementation, provider activation, hosted migration or production financial operation is authorized by this document.


## 8. Official provider and Thai tax research addendum (2026-10-31)

This addendum records public documentation findings only. It does not verify any VOOM merchant account, connected account, provider contract, tax registration, or eligibility.

### Payment capability findings

- Stripe's Thailand account support matrix lists Google Pay and PromptPay among supported methods; PromptPay is THB-only for Thailand accounts. The same matrix lists supported card networks and exclusions, so the adapter must use capability discovery/configuration rather than assume every card brand or wallet is available.
- Stripe's PromptPay enablement guidance says eligible Thailand Dashboard accounts have PromptPay automatically enabled; for Connect/connected accounts the platform must request the `promptpay_payments` capability. This makes platform-vs-tenant merchant onboarding a blocking decision for a Connect-based model.
- Google Wallet's Thailand support page lists specific participating issuers/cards and states the issuing bank determines whether a card can be added. NOVA must not promise that every Thai bank card works with Google Pay.
- Distinguish **Google Pay online checkout** (a payment method surfaced by a gateway) from **Google Wallet NFC contactless acceptance at a physical terminal**. The latter is not delivered merely by adding Google Pay to a web checkout.
- Bank of Thailand describes PromptPay as national payment infrastructure; NOVA should integrate through a contracted/accredited gateway or bank API rather than treat a QR image as authoritative payment confirmation.

Public references:
- Stripe Thailand supported methods: https://support.stripe.com/questions/supported-payment-methods-currencies-and-businesses-for-stripe-accounts-in-thailand
- Stripe PromptPay enablement: https://support.stripe.com/questions/how-to-enable-promptpay
- Google Wallet Thailand supported methods: https://support.google.com/wallet/answer/12059326?co=GENIE.CountryCode%3DTH
- Bank of Thailand PromptPay: https://www.bot.or.th/en/financial-innovation/digital-finance/digital-payment/promptpay.html

### Thailand tax and e-Tax findings

- Revenue Department guidance says a person/entity regularly supplying goods or services in Thailand with annual turnover exceeding THB 1.8 million is generally subject to VAT registration, with statutory exceptions and special regimes. The Revenue Department's registration guidance states application within 30 days after exceeding the threshold. This is a compliance flag and workflow prompt, not a substitute for professional tax determination.
- The tax engine must not assume every tenant is VAT-registered or charge VAT by default. Store issuer VAT status, effective dates, registration evidence, tax category/exemption basis and tax treatment version.
- Revenue Code Section 86/4 specifies required particulars for a full tax invoice; Section 86 requires registered operators to issue at the time VAT liability arises. The document engine therefore needs a tax-point decision separate from the payment-settlement timestamp. A payment success event alone must not universally trigger tax invoice issuance.
- Official e-Tax Invoice & e-Receipt materials describe registration/authorization, electronic certificates/digital signatures, XML data submission through approved channels, and record retention. A PDF receipt generated by NOVA is not automatically a legally compliant e-Tax Invoice/e-Receipt.
- The Revenue Department publishes separate technical standards for information security, retention, data exchange, electronic signatures, and e-Tax Invoice/e-Receipt. These standards must be mapped to the selected operating route.
- If NOVA acts only as software for an issuer, the tenant remains the issuer and is responsible for its eligibility and tax data. If NOVA or an affiliate becomes merchant of record, the tax and settlement obligations may change materially and require legal/accounting review.

Public references:
- VAT registration threshold and timing: https://rd.go.th/7061.html
- VAT non-registration cases: https://www.rd.go.th/7060.html
- Revenue Code Sections 85/86 and full tax invoice particulars: https://www.rd.go.th/5208.html
- RD ICT/e-Tax standards: https://www.rd.go.th/65244.html
- RD e-Tax overview: https://etax.rd.go.th/etax_staticpage/app/emag/flipbook_2567/pdf/01_Overview.pdf
- ETDA e-Tax FAQ: https://www.etda.or.th/en/contact/faq/e-Tax-Invoice-e-Receipt.aspx
- RD service-provider directory: https://efiling.rd.go.th/ef-cms-web/service-provider

### Proposed gateway-neutral contracts (design only; no code added)

1. `PaymentIntent`: tenant/platform scope, merchant account reference, order reference, amount in minor units, ISO currency, allowed payment methods, expiry, idempotency key and immutable pricing/tax snapshot hash.
2. `GatewayAccount`: provider key, merchant owner, environment (test/live), country/currency capabilities, allowed payment methods, connection status, credential secret reference, onboarding/KYC state. Never store provider secrets in application rows or browser payloads.
3. `ProviderEventInbox`: provider event ID, provider account, signature-verification result, received timestamp, payload hash, normalized event type, processing state and dedupe key. Preserve raw payload only in restricted encrypted storage with retention controls.
4. `PaymentAttempt`: provider intent/reference, attempt sequence, status, amount/currency, redirect/client token reference and lifecycle timestamps. Never let browser return URLs transition a payment to paid.
5. `RefundIntent`: amount, reason, approval reference, idempotency key, provider refund reference and settlement/reconciliation state. Refunds remain disabled until separately approved.
6. `LedgerPostingBatch`: source event, tenant, posting rule version, currency, balanced debit/credit lines, immutable posted timestamp and reversal reference. Enforce per-currency balancing and no direct mutation after posting.
7. `TaxDocument`: legal issuer, issuer branch, tax identity/VAT state, buyer identity, document type/series/number, tax point, line tax snapshots, source transaction, signature/certificate reference, XML hash, submission/delivery evidence and correction linkage.
8. `ReconciliationItem`: gateway settlement/bank statement reference, gross, fee, refund, reserve/adjustment, net settlement, currency and matched ledger references.

### Required design decisions before implementation

- Choose the merchant-of-record and settlement model: (A) VOOM charges tenants for VOOM subscriptions only; tenants separately connect their own gateway accounts for their customer sales; or (B) VOOM platform/Connect flow with connected-account onboarding, capability requests, settlement and platform liability explicitly defined. Do not mix the two.
- Confirm whether each tenant can connect its own merchant account and which gateway's connected-account product supports the required Thai capabilities. Stripe's PromptPay Connect capability requirement is a specific verification item, not proof that all tenant account types are eligible.
- Determine whether Google Pay is web checkout only for phase one; physical NFC terminal acceptance is a separate project.
- Have a Thai accountant/tax professional validate tax-point rules, VAT status handling, withholding tax applicability, exempt/zero-rated categories, document types and record-retention policy before production rules are frozen.
- Select the e-Tax operating route per issuer: self-operated with eligible certificate and authorization, or a currently authorized RD service provider. Confirm provider's current RD authorization scope and contract; do not infer authorization from a vendor marketing page.
- Define settlement clearing and gateway fee accounting before enabling reconciliation.

## 9. Updated W0 disposition

- [x] Research Stripe Thailand PromptPay and Google Pay capabilities from public provider documentation.
- [x] Research Google Wallet supported Thai issuer/card caveat.
- [x] Research Revenue Department VAT threshold, registration timing and full tax invoice requirements.
- [x] Research e-Tax authorization, digital signature, XML and service-provider route.
- [x] Record provider-neutral domain contracts and merchant-of-record decisions required.
- [ ] Complete repository inventory for existing event/outbox/idempotency, audit and file-storage patterns.
- [ ] Review PR #129/#131 overlaps and confirm migration reconciliation ownership; do not repeat hosted schema inspection.
- [ ] Obtain owner decision on merchant-of-record / connected-account model.
- [ ] Obtain accountant/legal review of the tax policy matrix.
- [ ] Review this Draft PR before any implementation or provider onboarding.

**Updated disposition:** Public research is complete for the initial Stripe/PromptPay/Google Pay and Thai e-Tax/VAT design questions. Finance W0 remains in progress. No code, schema, hosted database, credentials, provider account, deployment, charge, refund or tax document was changed or activated.


## 10. Additional exact-main repository inventory

The GitHub recursive tree was inspected at the same main SHA `a2acfd8ec9b598e6593413549bef760e8f596a72`. Relevant paths include:

- `frontend/app/auth/callback/page.jsx` and `frontend/lib/supabase-browser.ts`: existing frontend authentication integration to preserve; finance APIs must use the established server-authenticated route pattern rather than trust client-supplied tenant IDs.
- `supabase/migrations/` contains exactly the four migration files reported by PR #131:
  - `202610240001_alpaca_oauth.sql`
  - `202610270001_mt5_customer_connections.sql`
  - `202610290001_security_definer_marketplace_hardening.sql`
  - `202610300001_nova_durable_approval_lifecycle.sql`
- No finance-specific migration appears in this directory on the inspected main SHA.
- Existing tests include `tests/chat-api-auth-order.test.mjs`, `tests/frontend-gen-ai-auth-order.test.mjs`, `tests/supabase-marketplace-security-migration.test.mjs`, and a local approval integration test. These may provide patterns, but must be inspected before reuse; they do not constitute finance contract coverage.
- `integrations/mt5-readonly-bridge/test_tenant_guard.py` is broker-bridge tenant guard coverage, not proof of finance tenant isolation.
- Repository search found the term `idempotency` in `workers/execution/README.md` and prompt/research documentation. The execution worker README explicitly says the worker is disabled and lists idempotency, risk approvals and audit logging as prerequisites. No reusable production payment idempotency implementation was identified.
- Searches for an outbox, payment webhook inbox, finance audit log, private finance document storage or a finance ledger did not identify a reusable implementation. Search absence is not proof that no general-purpose helper exists; those helpers must be verified by code inspection before implementation.

### Reuse / extend / new / defer matrix

| Area | Decision | Reason / gate |
|---|---|---|
| Frontend and auth session | Reuse | Existing Next.js app and Supabase auth path; no second frontend |
| Tenant authorization | Extend only after schema/identity contract review | Must reconcile canonical tenant identity and membership model; never accept client tenant IDs as authority |
| Commercial catalog/order concepts | Reuse/align with PR #129 | Avoid duplicate commerce domain; PR is draft and requires review |
| Approval | Reuse only through a typed, reviewed extension | PR #67 is strategy-draft scoped; do not silently convert it into finance approval |
| Gateway adapters | New bounded module | No current payment integration identified; provider-neutral contract |
| Payment event inbox/idempotency | New bounded module unless a verified common helper is found | No production payment/event dedupe implementation identified |
| Ledger/accounting | New bounded module | No finance ledger or double-entry model identified |
| Tax identity and document engine | New bounded module | No issuer-specific tax/e-Tax implementation identified |
| e-Tax submission/signing | Defer to authorized route/provider | Requires issuer eligibility, certificate/authorization and RD-compatible XML/signing/retention |
| Reconciliation | New bounded module | No payment settlement/bank reconciliation implementation identified |
| Hosted migrations and RLS | Defer | Production/Staging ledger drift and PR #131 security findings remain blockers |
| Live payment/refunds | Defer | Explicit owner gate; no provider account or operational authorization |



## 11. Additional multi-gateway candidate research

Official provider documentation reviewed after the initial comparison:

| Provider | Verified public documentation signal | Current decision |
|---|---|---|
| Stripe | Thailand support matrix lists PromptPay (THB) and Google Pay; connected-account PromptPay capability must be requested | Primary sandbox candidate for one provider covering both requested online methods; connected-account eligibility remains a blocker to verify |
| 2C2P / Antom | Developer channel reference lists Thai PromptPay QR and Google Pay card-token channels; Google Pay integration guide documents its payment-token flow; sandbox onboarding is documented | Secondary candidate for merchant/tenant fit and regional method coverage; commercial pricing, merchant eligibility, exact Google Pay availability, settlement and connected-account model require written confirmation |
| Omise / Opn | Official PromptPay integration guide documents Thai PromptPay QR and says merchants must request enablement and accept terms | PromptPay-focused alternative/fallback candidate; no Google Pay capability is asserted by this research |

References:
- 2C2P payment channels: https://developer.2c2p.com/docs/reference-payment-channels
- 2C2P Google Pay integration: https://developer.2c2p.com/docs/google-pay
- 2C2P sandbox/onboarding overview: https://developer.2c2p.com/docs/general
- Omise PromptPay: https://docs.omise.co/promptpay
- Stripe Thailand method support: https://support.stripe.com/questions/supported-payment-methods-currencies-and-businesses-for-stripe-accounts-in-thailand

### Provider selection recommendation (not a commitment)

- Keep the adapter contract provider-neutral.
- Run Sandbox proof-of-capability first with Stripe for PromptPay + Google Pay in a VOOM-owned test merchant account if eligible.
- In parallel, request a 2C2P proposal and verify sandbox capabilities, account model, tenant sub-merchant onboarding, settlement ownership, fees, refunds, chargebacks, webhook signature/replay and reconciliation exports.
- Retain Omise as a PromptPay-only fallback candidate only if commercial onboarding, API and settlement terms are preferable.
- Do not implement automatic failover between gateways for an in-flight payment. Route only new PaymentIntents using an explicit provider selection and immutable attempt history. A gateway outage must never cause the same charge to be silently created at a second provider.



## 12. Owner decision: separate merchant accounts (2026-10-31)

**Decision: Option A — separate merchant accounts for v1.** This is an owner-selected product/funds-flow boundary, not a provider eligibility or legal determination.

- VOOM is merchant only for VOOM's own SaaS subscription charges.
- Each Tenant is the merchant for its own sales to its end customers and connects its own eligible gateway merchant account.
- Tenant receives its own gateway settlement directly under its provider agreement; NOVA must not pool, custody, split or transfer tenant sales proceeds in this v1 model.
- Tenant is the legal issuer of receipts and tax documents for its own sales, subject to its actual tax/VAT registration and applicable law.
- VOOM separately issues its own SaaS billing documents for VOOM subscription charges.
- NOVA provides provider-neutral payment orchestration, verified provider-event handling, tenant-scoped transaction visibility, ledger/reconciliation records and issuer-specific document workflows. Tenant identity and gateway-account ownership must be derived and enforced server-side.
- This decision does not make every tenant eligible for every gateway. Per-tenant merchant onboarding, country/currency/method capability, KYC, settlement ownership, fees, refunds, chargebacks, webhook signing/replay and reconciliation exports remain provider-specific verification gates.
- Stripe remains a sandbox proof-of-capability candidate, not a selected or connected production provider. In particular, verify whether a tenant's own Thailand merchant account can enable PromptPay and Google Pay without relying on a VOOM Connect/platform account. 2C2P/Antom remains a secondary candidate; Omise/Opn remains a PromptPay-focused fallback candidate.
- Google Pay phase-one scope remains **online web checkout only** for planning purposes; physical NFC terminal acceptance is explicitly out of scope unless separately approved.
- No payment provider is connected, no tenant credentials are collected, and no live charge, refund, payout or tax document is authorized by this decision.

### Consequences and next gates

1. Replace the unresolved merchant-of-record decision in the Finance W0 checklist with this owner decision; do not design a platform/Connect split-settlement flow for v1.
2. Produce a tenant-owned gateway onboarding/capability matrix and sandbox test plan for Stripe, 2C2P/Antom and the PromptPay fallback. Confirm that settlement goes directly to the tenant's merchant account.
3. Define separate platform SaaS billing and tenant-commerce ledgers/issuer identities; prohibit cross-tenant pooling and cross-tenant gateway-account access.
4. Obtain Thai accountant/legal review of tenant issuer responsibilities, VOOM SaaS tax documents, VAT status, tax point, withholding tax, corrections and retention before freezing tax rules.
5. Keep hosted schema work blocked until the existing Production/Staging migration ledger and identity/RLS baseline are reconciled and reviewed. Preserve PR #67 approval semantics; any finance approval extension must be separately typed and reviewed.
6. Keep sandbox-only until a separate explicit approval and exact verification evidence. Live payments, refunds, payouts and production tax issuance remain OFF.

**W0 status:** merchant-of-record/funds-flow choice is now owner-decided (A). Finance W0 remains in progress pending tenant-owned provider eligibility/onboarding evidence, remaining repository pattern inventory, migration/identity reconciliation ownership and professional tax review.


## 13. Tenant-owned gateway capability review and Sandbox test plan (2026-10-31)

This section uses current public provider documentation. It does not verify any VOOM/Tenant merchant account, contract, KYC approval, test credentials or live capability.

### 13.1 Provider capability disposition

| Candidate | Publicly documented evidence | Tenant-owned v1 assessment | Open verification |
|---|---|---|---|
| Stripe Thailand | Thailand account support matrix lists Google Pay and PromptPay; PromptPay is THB-only. Eligible Dashboard accounts have PromptPay automatically enabled. | **Primary Sandbox candidate.** The documented Thailand account methods fit the requested web checkout scope. Do not require Connect or platform custody for the selected A model. | Verify each Tenant's own Thailand account eligibility, Google Pay activation/merchant prerequisites, THB settlement account, test-mode availability, refunds, disputes, webhook signature and reconciliation exports. |
| 2C2P / Antom | Public channel catalogue lists Thai PromptPay QR (PPQR) and Google Pay (GOOGLEPAY). Google Pay guide requires Google Merchant ID/production access and shows a sample payment request in SGD. | **Secondary candidate only.** The catalogue establishes channel identifiers, not a Thai tenant's contractual enablement or THB settlement capability. | Obtain written confirmation for independent tenant merchant accounts, Thailand + THB + both methods, KYC, direct settlement, fee/refund/dispute rules, sandbox credentials, webhook verification and reconciliation reports. |
| Omise / Opn | Thailand PromptPay guide documents test-mode charge creation, webhook completion and independent status retrieval. PromptPay must be requested and terms accepted. Current guide states PromptPay charges cannot be voided/refunded through Omise and sets THB 20–150,000 limits. | **PromptPay fallback only.** It does not satisfy Google Pay by the evidence collected here; its PromptPay refund limitation is a material operational constraint. | Verify each Tenant's account activation, test keys, settlement bank/account ownership, webhook signature secret, event retry behavior, fees, disputes and manual refund process outside Omise. |

Public documentation:
- Stripe Thailand supported methods: https://support.stripe.com/questions/supported-payment-methods-currencies-and-businesses-for-stripe-accounts-in-thailand
- Stripe PromptPay enablement: https://support.stripe.com/questions/how-to-enable-promptpay
- Stripe Thailand Connect marketplace constraints (reference only; not the chosen A funds flow): https://support.stripe.com/questions/stripe-thailand-support-for-marketplaces
- 2C2P payment channel catalogue: https://developer.2c2p.com/docs/reference-payment-channels
- 2C2P Google Pay integration: https://developer.2c2p.com/docs/google-pay
- Omise PromptPay: https://docs.omise.co/promptpay
- Omise webhook signature verification: https://docs.omise.co/api-webhooks/thailand

**Important distinction:** provider documentation showing a payment-method code or general integration is not proof that every Thai tenant account is eligible. Stripe's Thailand Connect Direct Charges table documents a supported Thailand-platform/Thailand-connected-account combination for cards, debit cards and PromptPay, but A does not use VOOM as a Connect platform. Do not use that Connect table as a substitute for testing each Tenant's own independent merchant account. Google Pay eligibility must be verified separately for the tenant's actual Stripe account and Google Pay merchant setup.

### 13.2 Sandbox test plan (no credentials or provider account connected yet)

Run the following only after an individual Tenant voluntarily supplies its own test-mode merchant account through a secure onboarding flow. Never request credentials in chat, issues, logs or browser-visible configuration. Until that secure path exists, this is a test specification, not an executed test.

1. **Merchant ownership and onboarding**
   - Record provider, legal merchant identity, tenant owner reference, country, currency, test/live environment and enabled method capabilities.
   - Prove the provider account belongs to the authenticated Tenant; client-supplied tenant/account IDs are never authorization.
   - Prove tenant A cannot read, use, disconnect or inspect tenant B's gateway account.
   - Fail closed when KYC/onboarding, capability or ownership state is unknown, disabled or revoked.

2. **Payment creation and pricing integrity**
   - Create a THB test PaymentIntent using integer minor units and an immutable order/pricing/tax snapshot.
   - Enforce amount/currency equality between order, intent, provider request and verified provider result.
   - Enforce unique idempotency across tenant + merchant account + operation; same key/same payload returns the same logical result, while same key/different payload is rejected.
   - Expired, cancelled, duplicate and out-of-order attempts must not grant entitlement.

3. **PromptPay**
   - Create a test QR/payment attempt through the provider's server-side adapter.
   - Display QR/expiry and pending status only; browser return, uploaded slip or client callback never marks paid.
   - Test provider test-mode success, failure, expiry, duplicate webhook, delayed webhook and provider status re-fetch.
   - Mark paid only after verified provider event plus authoritative provider status check where supported.

4. **Google Pay web checkout**
   - Validate Google Pay merchant prerequisites and tokenization in test mode.
   - Keep payment token processing server-side and out of logs/analytics.
   - Test supported/unsupported browser/device, user cancellation, token failure, payment failure, duplicate callback and delayed final status.
   - Treat Google Pay as online web checkout only; do not include NFC terminal acceptance in this scope.

5. **Webhook and replay safety**
   - Verify provider signature against the exact raw request body using the provider's documented algorithm; compare signatures in constant time.
   - Validate timestamp/replay window where supported, persist provider event ID/dedupe key before processing, and make processing idempotent.
   - Reject invalid signature, malformed payload, unknown merchant account, amount/currency mismatch and event-to-tenant mismatch.
   - Support retry, duplicate delivery, out-of-order events and dead-letter/manual recovery without duplicate ledger posting.

6. **Settlement, fees and reconciliation**
   - Confirm settlement beneficiary is the Tenant's own bank/merchant account, not VOOM.
   - Import provider settlement/test report and match gross, fees, refunds, reserves/adjustments and net by currency.
   - Unmatched or conflicting rows remain exceptions; no silent auto-adjustment or cross-tenant netting.

7. **Refund and dispute boundaries**
   - Refund execution remains disabled in NOVA until a separate approved workflow and provider-specific tests exist.
   - Record provider refund capability, partial/full refund rules, fees, chargeback/dispute events and manual fallback per provider.
   - Omise PromptPay's documented no-void/no-refund limitation must be disclosed before choosing it for a Tenant's checkout.

8. **Evidence and exit gate**
   - Save sanitized request/response fixtures, test account ownership evidence, test run IDs, webhook signature/replay results, reconciliation output and provider documentation version/date.
   - No PAN, wallet token, secret key, webhook secret, bank login or unnecessary customer PII in evidence.
   - Sandbox readiness passes only per Tenant + provider + method; it does not imply production eligibility or approval.

### 13.3 Current execution status

- [x] Public docs compared for Stripe Thailand, 2C2P/Antom channels and Omise PromptPay.
- [x] Sandbox test specification and tenant-isolation requirements recorded.
- [ ] Tenant-owned test merchant account supplied through a secure provider onboarding path.
- [ ] Provider confirms tenant-specific method/currency capability and direct settlement.
- [ ] Sandbox payment and webhook tests executed with sanitized evidence.
- [ ] Settlement/reconciliation test evidence reviewed.
- [ ] Thai accountant/legal review of issuer and tax treatment completed.

**Disposition:** Stripe is the preferred first Sandbox candidate, subject to per-Tenant account confirmation. 2C2P/Antom is not yet proven for Thai THB tenant-owned Google Pay checkout. Omise is a PromptPay fallback with a documented refund limitation. No live provider, charge, refund, payout, tax issuance or hosted database change is enabled or authorized.

## 14. Stripe primary Sandbox selection and Secure Gateway Onboarding Contract (2026-10-31)

### Decision and scope

- Owner direction for this workstream: **Stripe is the primary Gateway candidate for the first Sandbox proof-of-capability**. This is a selection for technical evaluation only; it is not a production provider approval, a Stripe account connection, a merchant eligibility confirmation, or permission to accept real payments.
- Keep the architecture multi-gateway. 2C2P/Antom remains the secondary candidate and Omise/Opn remains the PromptPay-oriented fallback until evidence changes the decision.
- Preserve Merchant Option A: each Tenant is the merchant for its own customer sales, contracts with and owns its own eligible Stripe merchant account, and receives settlement directly from Stripe. VOOM is merchant only for VOOM SaaS charges. No pooled funds, platform custody, cross-tenant account access, or platform application-fee/transfer flow is introduced by this selection.
- The initial Stripe proof is limited to test-mode online checkout for the Tenant-owned account, including Thai THB PromptPay and Google Pay only where the specific account, payment method, currency, and checkout configuration are confirmed eligible. Google Pay NFC/POS is out of scope.
- Do not silently substitute Stripe Connect, destination charges, separate charges and transfers, or an account-on-behalf-of flow for the independent Tenant merchant model. If Stripe's required integration path changes merchant-of-record, liability, fees, chargeback ownership, or settlement, stop for a new owner decision and legal/provider confirmation.
- Keep Live mode, real payment, refunds, payouts, transfers, production tax-document issuance, and provider activation OFF.

### Secure onboarding must reuse the canonical Option C custody decision

- The canonical customer-secret custody direction is **Option C — a separate Secret Custody Plane**, documented in PR #130 (`docs/architecture/NOVA-SEPARATE-SECRET-CUSTODY-ADR.md`, `docs/architecture/NOVA-SECRET-CUSTODY-API-DATA-CONTRACT.md`, and `docs/security/NOVA-SEPARATE-SECRET-CUSTODY-THREAT-MODEL.md`). Treat PR #130 as the architecture dependency; do not create a parallel Vault design.
- PR #105 and PR #112 remain Draft historical Vault privilege/local-proof work. They do not authorize use of Supabase Vault for Tenant Stripe credentials. The readiness document `docs/implementation/NOVA-AUTO-API-SECRET-MANAGER-READINESS.md` explicitly says customer credential reads/writes remain blocked; do not route Stripe credentials through Supabase Vault, generic `service_role`, Cloudflare Worker Secrets, the System Hub, AI Worker, MCP, or browser storage.
- The custodian is the only component permitted to receive and use a Tenant's Stripe restricted test key. The credential must be submitted directly from a dedicated secure onboarding form to the custody API over TLS; it must never pass through the System Hub, chat, AI, MCP, analytics, logs, traces, support tickets, URL/query parameters, or CI artifacts.
- The custodian independently validates the Supabase user session, derives the principal from Auth, resolves the canonical connection through an owner-scoped/RLS path, and matches a custodian-owned binding registry. Browser-supplied `owner_id`, `tenant_id`, provider, environment, Stripe account ID, `custody_ref`, or generation is never authorization evidence.
- The existing inspected broker schema uses `broker_connections.user_id` and does not establish a canonical finance Tenant registry. Do not reuse broker connection tables for Stripe merchant accounts or invent `tenant_id`. Before onboarding, identify and verify the canonical Tenant/business ownership registry and prove the authenticated principal is authorized to administer that Tenant's merchant account. If this mapping is absent or ambiguous, fail closed and keep onboarding unavailable.
- Supabase stores only non-secret connection metadata and an opaque `custody_ref`; Stripe API keys, webhook signing secrets, ciphertext, DEKs, KEKs, private signing keys, and custodian database credentials remain inside the separately administered custody boundary. The custodian uses envelope encryption and non-exportable KMS/HSM keys, independent workload identity/mTLS, and a durable operation ledger as specified by PR #130.
- Any internal signed assertion is defense-in-depth only: use asymmetric signing with a non-exportable key in the separate custody/KMS boundary. No shared HMAC secret or symmetric signer shared with the System Hub/database is an acceptable production trust anchor.

### Stripe credential and account contract

- Sandbox onboarding should prefer a **Tenant-created Stripe restricted test-mode API key** with the minimum resource permissions required by the exact tested endpoints. Do not request or accept a full unrestricted secret key when a restricted key can satisfy the tested integration.
- Stripe restricted keys are configurable by resource and Read/Write permission. Derive the minimum permission set from the sandbox endpoint inventory; do not grant payout, transfer, refund, external-account mutation, dispute mutation, or unrelated billing permissions for the first proof. If the required endpoint cannot operate with least privilege, document the exact permission gap and stop rather than broadening silently.
- Treat `rk_test_...` and the endpoint-specific webhook signing secret as separate credentials with separate lifecycle, rotation, revocation, and custody references. Do not assume the webhook signing secret is an API key. Never expose either value after intake.
- The Tenant remains the Stripe account owner and is responsible for Stripe onboarding/KYC, legal entity details, bank settlement destination, payment-method enablement, disputes, and account standing. NOVA records only sanitized capability evidence and account identifiers after server-side verification.
- The exact account integration mode remains a gate: verify whether the independent account's restricted-key approach supports all required payment operations and webhook attribution without introducing a Connect/platform funds flow. If OAuth/Connect is required, pause and return to the owner for a funds-flow/liability review before implementation.
- Do not use Stripe account metadata, webhook-supplied metadata, or a client-provided Stripe account ID as the sole Tenant binding. Resolve the Stripe account identity against the custodian-owned registry and verified Tenant owner mapping.

### Stripe checkout, webhook, and ledger rules

1. Create a server-side PaymentIntent or Checkout Session only in Stripe test mode, scoped to the verified Tenant's own Stripe account and a server-created NOVA PaymentIntent. Use THB integer minor units and an immutable amount/currency/pricing/tax snapshot; never trust a browser amount or currency.
2. Explicitly request only payment methods confirmed available for that account and transaction. PromptPay is THB-only for Thai Stripe accounts according to Stripe's support matrix; eligibility and activation must still be confirmed for the Tenant account. Google Pay availability depends on Stripe account/payment configuration and the customer's supported card/device/bank; do not promise universal Thai card coverage.
3. Browser redirects, client callbacks, uploaded slips, screenshots, and frontend success state are not proof of payment. A payment becomes paid only after a verified Stripe server event or authoritative server-side retrieval confirms the final status for the exact PaymentIntent/Checkout Session and amount.
4. Verify Stripe webhooks using the exact raw request body, the `Stripe-Signature` header, and the endpoint-specific signing secret with Stripe's maintained SDK. Reject modified/parsed bodies, invalid signatures, timestamps outside tolerance, unknown endpoint/account bindings, and malformed events. Do not log the raw body or signature secret.
5. Persist a verified event inbox keyed by Stripe `event.id` and account/environment binding before asynchronous processing. Enforce deduplication, idempotent state transitions, replay handling, delayed/duplicate/out-of-order delivery, retry and dead-letter handling. Never trust webhook metadata as the authority for Tenant ownership.
6. Handle asynchronous payment states explicitly, including pending PromptPay and asynchronous success/failure. Reconcile the event with the current Stripe object before posting ledger entries. A delayed event must not regress a terminal payment state.
7. Use Stripe idempotency keys for create operations, scoped to one logical NOVA operation and deterministic request fingerprint. A timeout after a request may have reached Stripe becomes `OUTCOME_UNKNOWN`; reconcile by Stripe object/reference and provider evidence before retrying. Do not create a duplicate charge because a network request timed out.
8. Tenant gross amount, Stripe fees, refunds/adjustments, reserves, and net settlement are reconciled from provider balance/settlement evidence to the Tenant ledger. Stripe settlement must go to the Tenant's verified Stripe payout account under Option A. No VOOM transfer or pooled settlement.
9. Refunds and payout mutations remain disabled for this proof. PromptPay refund behavior and provider/account limitations must be separately confirmed before any future refund design. No refund endpoint is enabled by this section.

### Acceptance tests before Sandbox credentials or transactions

- [ ] Canonical Tenant/business registry and authenticated owner-to-Tenant administration mapping verified; no assumed `tenant_id` or broker-schema reuse.
- [ ] PR #130 Option C custodian exact-head local proof and required CI status rechecked; current production custody readiness is not inferred from a Draft PR or a synthetic local test.
- [ ] Separate custody environment, account ownership, workload identity/mTLS, KMS/HSM key policy, isolated datastore, audit sink, backup/restore, and no-cache/log-redaction controls independently reviewed before any real customer key is accepted.
- [ ] Tenant-owned Stripe test account is confirmed eligible for Thailand, THB, PromptPay and Google Pay web checkout; evidence is captured per account and method. Stripe Connect documentation is not substituted for independent-account evidence.
- [ ] Restricted test key is created by the Tenant with a reviewed minimum permission matrix; payout/transfer/refund capabilities are absent; key rotation and revocation are demonstrated.
- [ ] Stripe webhook endpoint is bound to the exact Tenant account/environment; raw-body signature verification, timestamp tolerance, event dedupe, replay, duplicate, delayed, out-of-order and invalid-signature tests pass.
- [ ] PromptPay pending/expiry/success/failure and Google Pay web checkout success/cancel/failure paths are exercised in test mode with sanitized evidence; no real customer funds.
- [ ] PaymentIntent/Checkout Session amount, THB minor-unit arithmetic, idempotency, unknown-outcome reconciliation, provider fees, direct Tenant settlement reporting, and ledger balancing are tested.
- [ ] Cross-Tenant tests prove Tenant A cannot view, alter, use, rotate, revoke, or reconcile Tenant B's Stripe account, key, webhook, payment, event, or settlement references; zero provider calls occur on denied requests.
- [ ] Independent security review, Thai legal/accounting review, and explicit owner approval are complete before any staging activation; a separate approval is required for Live mode.

### Current disposition

Stripe is selected as the first Sandbox proof-of-capability candidate only. No Stripe account has been connected, no API key or webhook secret has been collected, no Sandbox transaction has been executed, and no implementation or hosted schema change is authorized by this addendum. The separate Secret Custody Plane remains design/proof work under PR #130; Tenant identity mapping, custodian runtime proof, provider eligibility, webhook/reconciliation evidence, and tax/accounting review remain open gates.
