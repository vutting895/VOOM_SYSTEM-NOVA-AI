DO $$
DECLARE
  expected text[] := ARRAY['nova_agent_threads','nova_approval_requests','broker_connections'];
  missing text[];
  rls_count integer;
  migration_count integer;
BEGIN
  SELECT array_agg(t.name ORDER BY t.name) INTO missing
  FROM unnest(expected) AS t(name)
  WHERE to_regclass(format('public.%I', t.name)) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'staging replay missing public tables: %', missing;
  END IF;

  SELECT count(*) INTO rls_count
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r'
    AND c.relname = ANY(expected) AND c.relrowsecurity;
  IF rls_count <> cardinality(expected) THEN
    RAISE EXCEPTION 'staging replay RLS mismatch: expected %, got %', cardinality(expected), rls_count;
  END IF;

  SELECT count(*) INTO migration_count
  FROM supabase_migrations.schema_migrations
  WHERE name <> 'ci_extensions';
  IF migration_count <> 2 THEN
    RAISE EXCEPTION 'staging replay migration count mismatch: expected 2, got %', migration_count;
  END IF;

  IF to_regprocedure('public.nova_create_approval(uuid,text,jsonb,text,text,timestamp with time zone)') IS NULL
     OR to_regprocedure('public.nova_resolve_approval(uuid,text,text,jsonb,text)') IS NULL
     OR to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'staging replay missing approval RPC or pgcrypto digest';
  END IF;
END $$;

SELECT 'staging recovered migration replay assertions passed' AS result;
