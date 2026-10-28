-- Customer paper-trading desk. Paper only: no broker connection, no order execution.
-- Apply in the Supabase SQL Editor before the customer trade screen can save orders.
begin;

create table if not exists public.paper_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol in ('EURUSD','XAUUSD','BTCUSD','USDJPY')),
  side text not null check (side in ('BUY','SELL')),
  lots numeric not null check (lots >= 0.01 and lots <= 10),
  entry_price numeric not null check (entry_price > 0),
  exit_price numeric check (exit_price > 0),
  status text not null default 'open' check (status in ('open','closed')),
  pnl numeric,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  check ((status = 'closed') = (exit_price is not null)),
  check ((status = 'closed') = (closed_at is not null)),
  check ((status = 'closed') = (pnl is not null))
);
create index if not exists paper_orders_user_opened_idx
  on public.paper_orders(user_id, opened_at desc);

alter table public.paper_orders enable row level security;
revoke all on public.paper_orders from anon, authenticated;

-- Each customer sees and closes only their own paper orders.
create policy "customer reads own paper orders" on public.paper_orders
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "customer opens own paper order" on public.paper_orders
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and status = 'open' and exit_price is null and pnl is null
  );

create policy "customer closes own paper order" on public.paper_orders
  for update to authenticated
  using ((select auth.uid()) = user_id and status = 'open')
  with check ((select auth.uid()) = user_id and status = 'closed');

grant select on public.paper_orders to authenticated;
grant insert (user_id, symbol, side, lots, entry_price) on public.paper_orders to authenticated;
grant update (exit_price, pnl, status, closed_at) on public.paper_orders to authenticated;

commit;
