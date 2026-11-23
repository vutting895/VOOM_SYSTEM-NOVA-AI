-- Allow security-invoker public views to resolve NOVA base objects.
-- This does not expose the nova schema through PostgREST; only schema USAGE is granted.
begin;
grant usage on schema nova to authenticated, service_role;
commit;
