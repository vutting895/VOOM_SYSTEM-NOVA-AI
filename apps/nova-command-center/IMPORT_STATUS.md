# Import status

Imported from Lovable project `aac145fc-7ebe-4b20-9f79-61a9125e5839`, source snapshot `f452cc3cd94d3f302f4e8f42620920f410441700`.

This remains a source import under validation; it is not yet a verified standalone build.

## Import repairs applied on this branch

- Added the missing NOVA route metadata helper.
- Added local-only UI error reporting (no external telemetry).
- Added the Sonner toast adapter.
- Added the missing Label, Tabs and Table UI primitives.
- Removed the dangling custom TanStack server-entry override because the imported snapshot does not include its custom server entry.

## Remaining validation gates

- Establish a reproducible dependency installation and lockfile strategy for this nested app. The repository root currently has a Bun lockfile but does not declare this app as a workspace.
- Run a clean dependency install, TypeScript check, unit tests, lint and production build against this branch.
- Verify static PWA assets and deployment configuration.
- Verify Supabase Auth, backend JWT/RBAC and RLS in a non-production preview before any production connection.

## Safety

- No production Supabase migration was run.
- No secrets were copied.
- Live trading, broker writes, order placement and funds movement remain disabled.
- This import remains isolated under `apps/nova-command-center/`; it does not replace the repository root application.
