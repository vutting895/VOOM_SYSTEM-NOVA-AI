# NOVA Data Ingestion Worker

Authenticated, per-user owner-scoped, telemetry-only ingestion API. This worker is separate from the Remote MCP Gateway and does not expose broker, order, execution, or trading routes.

## Routes

- `GET /health`: non-sensitive service/mode response.
- `POST /v1/events`: authenticated JSON event ingestion.
- `GET /v1/events/{event_id}`: authenticated owner-scoped read-back.

Identity is derived by validating the caller's Supabase access token against the configured Supabase Auth `/auth/v1/user` endpoint. The verified Supabase user UUID is currently the owner namespace; this is per-user isolation, not a shared organization-tenant membership model. A tenant ID in the request body or headers is never trusted. The D1 primary key is `(tenant_id,event_id)`. Identical replay is idempotent; same ID with different request bytes returns HTTP 409; the host uploader sends deterministic canonical JSON.

## Required configuration

- Worker variable `SUPABASE_URL`: HTTPS Supabase project URL.
- Worker variable `SUPABASE_PUBLISHABLE_KEY`: project publishable/anon key used only for Auth validation.
- D1 database binding `DB`: provision the database, replace the placeholder database ID in wrangler.toml, and apply `migrations/0001_create_nova_brain_events.sql`.

No service-role key, database password, broker credential, or account identifier belongs in this Worker.

## Safety boundary

This is a telemetry receiver only. It has no trading routes and no code path to the MT5 bridge. The event schema allows signal labels such as BUY/SELL as research observations, not instructions. Execution audit events are accepted only when READ_ONLY, broker_request_attempted=false and broker_transport_calls=0.

## Current limitations — do not claim production readiness

- Both host uploader and Worker validate against the pinned Draft 2020-12 JSON Schema. Worker additionally applies safety-critical semantic checks. Exact schema-parity and real authenticated integration tests remain required.
- D1 has not been provisioned or migrated. No deployment has been performed.
- Real Supabase Auth/D1 end-to-end tests, owner-isolation tests and concurrent duplicate-race tests are pending.
- No MT5 terminal export/ingestion/read-back receipt exists yet.
- This worker does not start model training or promote models after ingestion.
