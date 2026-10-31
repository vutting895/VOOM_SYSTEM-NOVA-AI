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
