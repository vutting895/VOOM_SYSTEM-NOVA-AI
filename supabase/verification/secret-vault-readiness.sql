-- NOVA Auto API Secret Manager: read-only Vault readiness inspection.
-- Run against the approved STAGING project using the SQL Editor.
-- This script inspects extension metadata and grants only. It NEVER reads secret values,
-- calls vault.create_secret(), calls vault.decrypted_secrets, or changes database state.

-- 1) Confirm the Vault extension and its relation objects exist.
select jsonb_build_object(
  'extension_installed', exists (
    select 1 from pg_extension where extname = 'supabase_vault'
  ),
  'extension_version', (
    select extversion from pg_extension where extname = 'supabase_vault'
  ),
  'extension_schema', (
    select n.nspname
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'supabase_vault'
  ),
  'secrets_table_present', to_regclass('vault.secrets') is not null,
  'decrypted_view_present', to_regclass('vault.decrypted_secrets') is not null,
  'postgres_version', current_setting('server_version')
) as vault_extension_status;

-- 2) Check schema USAGE without selecting from Vault.
select
  r.rolname as role_name,
  case
    when to_regnamespace('vault') is null then null
    else has_schema_privilege(r.rolname, 'vault', 'USAGE')
  end as vault_schema_usage
from pg_roles r
where r.rolname in (
  'anon',
  'authenticated',
  'service_role',
  'postgres',
  'nova_secret_manager'
)
order by r.rolname;

-- 3) Inspect table/view grants. This returns privilege metadata only, never row contents.
select
  grantee,
  table_schema,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'vault'
  and grantee in (
    'anon',
    'authenticated',
    'service_role',
    'postgres',
    'nova_secret_manager'
  )
order by grantee, table_name, privilege_type;

-- 4) Inspect function EXECUTE grants. Function bodies and secret values are not selected.
select
  grantee,
  routine_schema,
  routine_name,
  privilege_type
from information_schema.role_routine_grants
where routine_schema = 'vault'
  and grantee in (
    'anon',
    'authenticated',
    'service_role',
    'postgres',
    'nova_secret_manager'
  )
order by grantee, routine_name, privilege_type;

-- 5) Confirm whether the proposed dedicated role exists and whether it is privileged.
select
  rolname as role_name,
  rolcanlogin as can_login,
  rolsuper as is_superuser,
  rolbypassrls as bypasses_rls
from pg_roles
where rolname in ('nova_secret_manager', 'service_role', 'authenticated', 'anon')
order by rolname;


-- 6) Inspect the legacy user_brokers credential surface using catalog metadata only.
-- Never select from public.user_brokers or inspect credential contents.
select jsonb_build_object(
  'table_present', to_regclass('public.user_brokers') is not null,
  'rls_enabled', coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='user_brokers'), false),
  'force_rls', coalesce((select c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='user_brokers'), false),
  'policy_count', (select count(*) from pg_policies where schemaname='public' and tablename='user_brokers'),
  'sensitive_columns_present', coalesce((select jsonb_agg(column_name order by column_name) from information_schema.columns where table_schema='public' and table_name='user_brokers' and column_name in ('api_key','api_secret_encrypted','passphrase_encrypted')), '[]'::jsonb),
  'sensitive_column_grants', coalesce((select jsonb_agg(jsonb_build_object('grantee',grantee,'column',column_name,'privilege',privilege_type) order by grantee,column_name,privilege_type) from information_schema.role_column_grants where table_schema='public' and table_name='user_brokers' and column_name in ('api_key','api_secret_encrypted','passphrase_encrypted') and grantee in ('anon','authenticated','service_role','postgres')), '[]'::jsonb)
) as legacy_user_brokers_credential_surface;