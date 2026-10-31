create or replace function public.voom_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customer_profiles (user_id, display_name, account_status, role)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
    'active',
    'customer'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.voom_handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists voom_auth_user_created on auth.users;
create trigger voom_auth_user_created
  after insert on auth.users
  for each row execute function public.voom_handle_new_auth_user();
