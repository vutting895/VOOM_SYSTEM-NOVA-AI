-- Customer profile records for Supabase Auth users.
-- Apply through the existing migration workflow; this commit does not change the live database.
create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  account_status text not null default 'pending'
    check (account_status in ('pending', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_profiles enable row level security;

revoke all on table public.customer_profiles from anon, authenticated;
grant select, update on table public.customer_profiles to authenticated;

drop policy if exists "Customers can read their own profile" on public.customer_profiles;
create policy "Customers can read their own profile"
  on public.customer_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Customers can update their own profile" on public.customer_profiles;
create policy "Customers can update their own profile"
  on public.customer_profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.create_customer_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customer_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_customer_profile_for_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_customer_profile on auth.users;
create trigger on_auth_user_created_customer_profile
  after insert on auth.users
  for each row execute function public.create_customer_profile_for_auth_user();

create or replace function public.set_customer_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_customer_profile_updated_at() from public, anon, authenticated;

drop trigger if exists customer_profiles_set_updated_at on public.customer_profiles;
create trigger customer_profiles_set_updated_at
  before update on public.customer_profiles
  for each row execute function public.set_customer_profile_updated_at();
