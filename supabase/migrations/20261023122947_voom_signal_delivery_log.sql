create table if not exists public.signal_delivery_log (
 id uuid primary key default gen_random_uuid(),
 signal_id uuid not null references public.strategy_signals(id) on delete cascade,
 subscription_id uuid not null references public.customer_ai_subscriptions(id) on delete cascade,
 delivery_status text not null default 'queued' check (delivery_status in ('queued','sent_to_ea','acknowledged','rejected','failed','duplicate_blocked')),
 idempotency_key text not null unique,
 attempt_count integer not null default 0 check (attempt_count >= 0),
 last_error_code text,
 created_at timestamptz not null default now(),
 delivered_at timestamptz
);
create index if not exists signal_delivery_status_idx on public.signal_delivery_log(delivery_status, created_at desc);
alter table public.signal_delivery_log enable row level security;
revoke all on public.signal_delivery_log from anon, authenticated;