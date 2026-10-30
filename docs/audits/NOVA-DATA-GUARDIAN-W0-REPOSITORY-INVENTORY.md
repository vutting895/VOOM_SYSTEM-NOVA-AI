# NOVA Data Guardian — W0 Repository Inventory

**Status:** Partial W0 complete; repository evidence only.  
**Inspection mode:** Read-only GitHub repository inspection.  
**Repository:** `vutting895/VOOM_SYSTEM-NOVA-AI`  
**Inspected ref:** `main`  
**Inspected SHA:** `a2acfd8ec9b598e6593413549bef760e8f596a72`  
**Tracking:** Issue #132  
**Related design:** `docs/architecture/NOVA-DATA-GUARDIAN-ARCHITECTURE.md`

## 1. Executive result

The repository contains an established Next.js/Supabase application, authenticated server-side API patterns, owner-scoped database records, Cloudflare Workers and a tenant-scoped MT5 read-only relay. The inspected tree and migrations do **not** establish an existing general-purpose file upload/download service, Data Guardian runtime, backup provider, recovery workflow, antivirus scanner, or storage lifecycle policy.

This is a repository-only finding. It does not prove that external Supabase, Netlify, Cloudflare, local Windows, NAS or cloud storage resources do not exist. Those provider/runtime resources were not accessed in this W0 pass.

**Decision:** Do not start customer-data processing, storage migrations, cleanup, backup provisioning or production automation. Proceed only with W1 contract design and isolated synthetic tests until the external inventory and identity gates are resolved.

## 2. Repository baseline evidence

- Repository metadata reports private repository, default branch `main`, active repository, and the inspected main ref at `a2acfd8ec9b598e6593413549bef760e8f596a72`.
- Recursive Git tree returned 275 entries and was not marked truncated.
- Root layout includes `.github`, `docs`, `frontend`, `infra`, `integrations`, `shared`, `supabase`, `tests`, `tools`, and `workers`.
- Frontend package declares Next.js 15, React 19, Supabase JS and a TypeScript typecheck script.
- `.gitignore` excludes `.env`, virtual environments, Python cache, frontend dependencies/build output, logs, SQLite files and a local `data/` directory. It does not establish a tested backup exclusion/retention policy.
- `.env.example` contains blank optional exchange/MT5 placeholders and a false live-trading flag; no secret values were inspected or copied.

## 3. File and storage capability inventory

| Capability | Repository evidence | W0 finding |
|---|---|---|
| General file upload/download API | Recursive tree under `frontend/app/api` contains agent, backtest, broker, chat and gen-ai routes; no general file endpoint was found | Not established |
| File transformation / resize / conversion | No matching production module or package surfaced in the inspected tree | Not established |
| Cleanup / duplicate detection | No general cleanup module or scheduler found in inspected paths | Not established |
| Antivirus / quarantine | No scanner integration or quarantine module found in inspected paths | Not established |
| Backup / restore | No general backup adapter, manifest or restore workflow found in inspected paths | Not established |
| Object storage / NAS / R2 | No storage adapter, bucket declaration or R2 binding found in inspected tree | Provider inventory outstanding |
| Temporary file lifecycle | `.gitignore` excludes local `data/` and build/cache directories, but no runtime retention contract was found | Not established |
| Local generated artifacts | `artifacts/` contains integration artifacts and upload guidance | Must not classify as disposable |
| Research datasets | Existing worker/research areas and data-related docs exist | Preserve; do not cleanup by heuristic |

Searches were scoped to the default branch and supplemented by recursive tree inspection. Absence in these results is not proof of absence in external providers or ignored local directories.

## 4. Supabase schema and ownership evidence

The inspected repository currently contains four SQL migrations:

1. `202610240001_alpaca_oauth.sql`
2. `202610270001_mt5_customer_connections.sql`
3. `202610290001_security_definer_marketplace_hardening.sql`
4. `202610300001_nova_durable_approval_lifecycle.sql`

### Confirmed from inspected SQL

- Broker connections use `user_id uuid not null default auth.uid() references auth.users(id)`, with RLS and own-row select/insert constraints.
- NOVA agent threads and approval requests also use `user_id` linked to `auth.users(id)`, composite owner/thread relationships and owner-scoped policies.
- The marketplace hardening migration moves privileged implementations to a non-exposed `private` schema and retains public SECURITY INVOKER wrappers.
- The legacy Alpaca migration stores encrypted token ciphertext and server-only service-role access patterns, but README states Alpaca is not part of the active broker workflow.

### Not established

- No canonical general-purpose `tenant_id` or organization registry was established by these inspected migrations.
- No file metadata table, storage bucket policy, file-object RLS policy, backup manifest schema or retention/legal-hold schema was found in the migration set.
- No live Supabase migration history, project settings, Storage buckets, RLS catalog, grants or provider plan was queried in this pass.

**Identity gate:** Existing `user_id/auth.uid()` ownership is visible for selected features, but it is not sufficient evidence to invent a general tenant model. Data Guardian must not add tables or claim tenant-safe storage until the canonical identity contract and staging RLS behavior are explicitly verified.

## 5. Authentication and integration patterns

- `frontend/lib/agent-approval-server.js` authenticates a bearer access token by calling Supabase `auth.getUser(accessToken)`; API routes use the authenticated user ID for owner filtering and inserts.
- `frontend/app/api/agent/threads/route.js` shows a server-side authenticated route pattern and explicitly returns execution/live-trading disabled flags.
- The inspected MT5 bridge tenant-guard tests assert environment-derived tenant identity, constant-time token comparison, bearer/tenant checks on private reads, and read-only HTTP/path restrictions.
- `integrations/mt5-bridge-relay/worker.js` uses a tenant route map and a Durable Object namespace keyed by tenant ID; missing route map/session binding fails closed. This is broker-specific infrastructure, not a generic file-storage adapter.
- `docs/architecture/NOVA-CUSTOMER-MULTIBROKER-AUTOCONNECT.md` explicitly requires trusted Hub-side owner resolution and disallows model/client-supplied ownership authority.

These are reusable architectural patterns only. Data Guardian must not reuse broker route maps, broker secrets, or MT5-specific APIs as a file-storage system.

## 6. External inventory still outstanding

The following require read-only access to the actual provider/runtime or an owner-supplied sanitized export:

| Area | Evidence required | Current state |
|---|---|---|
| Supabase project | Project identity, migration history, schemas, extensions, RLS, grants, Storage buckets/policies, quotas | Not inspected live |
| Netlify | Site identity, deployed commit, frontend environment-variable names/presence only, build configuration | Not inspected live for Data Guardian |
| Cloudflare | Account/Worker inventory, R2 buckets, bindings, Durable Objects, secrets names/presence without values, retention settings | Not inspected live for Data Guardian |
| Windows workstation | Approved roots, volume free space, file classes, local backup tools, scanner state; metadata-only scan | Not inspected |
| NAS / cloud backup | Provider, region, encryption, versioning, immutability, retention, restore permissions | Unknown |
| Legal/operations policy | Retention, deletion, legal hold, RPO/RTO, recovery authority | Not supplied/approved |

Do not request or print secrets, credentials, account IDs, customer file contents or full personal file paths in chat or issues.

## 7. Risks and blockers

1. **Storage provider unknown:** No provider-neutral adapter can be bound to real storage safely yet.
2. **Tenant contract unresolved:** Existing `user_id` ownership in selected tables does not establish a universal tenant/organization identity.
3. **No file-object schema:** Adding metadata tables before identity and migration baseline approval risks creating a parallel/incorrect ownership model.
4. **No backup proof:** No manifest, immutability or restore test is evidenced. Do not claim recoverability.
5. **No scanner proof:** No scanner, signature freshness policy or quarantine path is evidenced. Do not claim malware protection.
6. **No local-machine authorization:** Repository inspection does not grant access to the user's Windows PC or authorize disk cleanup.

## 8. W0 exit status

| Check | Status |
|---|---|
| Confirm repository, default branch and main SHA | PASS — repository evidence |
| Enumerate tracked repository tree | PASS — 275 entries, not truncated |
| Inspect frontend/API and key integration patterns | PASS — selected source files inspected |
| Inspect checked-in Supabase migrations | PASS — four migrations inspected |
| Identify existing general file/storage modules | PARTIAL — no such module established in inspected tree |
| Verify live Supabase schema/RLS/Storage | BLOCKED — provider not inspected |
| Verify Cloudflare R2 / Netlify / external storage | BLOCKED — provider not inspected |
| Inspect local Windows disks/files | BLOCKED — no authorized local runtime inspection |
| Approve canonical tenant identity for file objects | BLOCKED — no universal tenant contract established |
| Approve backup destination and retention | BLOCKED — operational policy/provider unknown |

**W0 is partial, not complete.** The next safe step is W1: define typed storage/file operation contracts and build isolated synthetic tests that never access production/customer data. In parallel, obtain read-only provider inventory and explicit approval for any local-machine inspection.

## 9. Safety boundary

This inventory performed no filesystem cleanup, no storage writes, no database migrations, no RLS/grant changes, no secret retrieval, no provider provisioning, no schedule creation, no deployment and no customer-data processing. Exness Demo remains read-only; order submission and Live Trading remain disabled.
