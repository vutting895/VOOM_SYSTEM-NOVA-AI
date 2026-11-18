-- Run after the NOVA Data Catalog migration is applied to Voom_system.
-- Expected: exactly three tables exist, RLS is enabled, service_role has access,
-- and anon/authenticated have no direct table privileges.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  has_table_privilege('service_role', c.oid, 'SELECT') as service_role_select,
  has_table_privilege('service_role', c.oid, 'INSERT') as service_role_insert,
  has_table_privilege('service_role', c.oid, 'UPDATE') as service_role_update,
  has_table_privilege('service_role', c.oid, 'DELETE') as service_role_delete,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('nova_data_ingestion_jobs','nova_datasets','nova_data_artifacts')
order by c.relname;

select
  to_regclass('public.nova_data_ingestion_jobs') is not null as ingestion_jobs_exists,
  to_regclass('public.nova_datasets') is not null as datasets_exists,
  to_regclass('public.nova_data_artifacts') is not null as data_artifacts_exists;
