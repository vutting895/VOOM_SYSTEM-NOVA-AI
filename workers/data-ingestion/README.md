# NOVA Data Ingestion

Scope: accept allow-listed market/telemetry inputs, validate schemas, normalize timestamps and symbols, deduplicate events, and retain source provenance. Reject malformed or stale payloads. No order execution.

## Supabase persistence

\`\`\`text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only-secret>
NOVA_PERSIST_TO_SUPABASE=true
NOVA_MARKET_SYMBOL=BTCUSDT
NOVA_MARKET_INTERVAL=1h
\`\`\`

- Keep \`SUPABASE_SERVICE_ROLE_KEY\` only in a trusted server/Worker secret store. Never use it in Netlify \`NEXT_PUBLIC_*\` variables, browser code, Git, logs, or chat.
- Persistence is opt-in. Without \`NOVA_PERSIST_TO_SUPABASE=true\`, the public Binance prototype only fetches and reports data; it does not write to Supabase.
- \`supabase_store.py\` sends bounded idempotent upserts to \`nova_market_candles\` and sanitized run metadata to \`nova_ingestion_runs\`.
- Decimal values remain strings until Postgres \`numeric\` stores them; do not convert prices or volume to binary floats in the persistence path.
- Shared public feed rows use \`scope_key=shared\`. Exness Demo rows must include the verified authenticated owner UUID and use \`environment=demo\`.
- The central schema is currently a pending proposal at \`supabase/pending/nova-central-data.sql\`. Do not enable persistence against a hosted project until the schema migration has passed the baseline replay gate and has been separately approved for deployment.

## Runtime boundaries

- The MT5 Bridge remains read-only. It must pass the owner identity established by the authenticated System Hub/proxy path; never accept an arbitrary owner UUID from a browser request.
- No credentials or raw broker payloads are stored in ingestion run metadata.
- \`orders_enabled\`, \`execution_enabled\`, and \`live_trading_enabled\` remain false.
- Status: scaffold; provider adapters, schema activation and runtime acceptance remain pending.
