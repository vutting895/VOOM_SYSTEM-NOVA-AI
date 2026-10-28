-- Voom_system Auth roles. Role is writable only by trusted database administrators/service backend.
begin;
alter table public.customer_profiles
  add column if not exists role text not null default 'customer'
  check (role in ('customer','staff','admin'));
revoke update on public.customer_profiles from anon, authenticated;
grant update(display_name) on public.customer_profiles to authenticated;
comment on column public.customer_profiles.role is
  'Trusted role assignment only. Never grant customers permission to modify this column.';
commit;
