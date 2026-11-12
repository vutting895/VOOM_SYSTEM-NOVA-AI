-- NOVA account-wide capacity reservation ledger.
-- Follow-up implementation from current main; no broker order execution.
-- One MT5 account (login + server) can be owned by exactly one tenant.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE IF NOT EXISTS private.nova_order_capacity_accounts (
  tenant_id uuid NOT NULL,
  account_login bigint NOT NULL CHECK (account_login > 0),
  account_server text NOT NULL CHECK (char_length(btrim(account_server)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, account_login, account_server)
);

-- Also applies when the prior reservation table already exists from an earlier
-- migration: CREATE TABLE IF NOT EXISTS alone would not add the global key.
-- Existing duplicate account ownership intentionally makes this migration fail.
CREATE UNIQUE INDEX IF NOT EXISTS nova_order_capacity_account_global_owner_idx
  ON private.nova_order_capacity_accounts (account_login, account_server);

CREATE TABLE IF NOT EXISTS private.nova_order_capacity_reservations (
  reservation_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  account_login bigint NOT NULL,
  account_server text NOT NULL,
  command_id uuid NOT NULL,
  broker_order_ticket text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE (tenant_id, account_login, account_server, command_id),
  UNIQUE (tenant_id, account_login, account_server, broker_order_ticket),
  FOREIGN KEY (tenant_id, account_login, account_server)
    REFERENCES private.nova_order_capacity_accounts (tenant_id, account_login, account_server)
    ON DELETE CASCADE,
  CHECK (
    (broker_order_ticket IS NULL AND expires_at IS NOT NULL)
    OR (broker_order_ticket IS NOT NULL AND expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS nova_order_capacity_reservations_account_idx
  ON private.nova_order_capacity_reservations
  (tenant_id, account_login, account_server, expires_at);

REVOKE ALL ON TABLE private.nova_order_capacity_accounts, private.nova_order_capacity_reservations
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON private.nova_order_capacity_accounts, private.nova_order_capacity_reservations
  TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_nova_order_capacity(
  p_tenant_id uuid,
  p_account_login bigint,
  p_account_server text,
  p_command_id uuid,
  p_reservation_id uuid,
  p_open_positions integer,
  p_open_pending_orders integer,
  p_snapshot_at timestamptz,
  p_lease_seconds integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_owner_tenant_id uuid;
  v_active_reservations integer;
  v_inserted integer;
BEGIN
  IF p_tenant_id IS NULL OR p_command_id IS NULL OR p_reservation_id IS NULL
     OR p_account_login IS NULL OR p_account_login <= 0
     OR p_account_server IS NULL OR char_length(btrim(p_account_server)) NOT BETWEEN 1 AND 120
     OR p_open_positions IS NULL OR p_open_positions < 0
     OR p_open_pending_orders IS NULL OR p_open_pending_orders < 0
     OR p_snapshot_at IS NULL
     OR p_snapshot_at > pg_catalog.clock_timestamp() + interval '1 second'
     OR p_snapshot_at < pg_catalog.clock_timestamp() - interval '5 seconds'
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 1 AND 60
  THEN
    RETURN false;
  END IF;

  -- The unique account identity is global, not tenant-scoped. Concurrent
  -- first claims serialize on this unique key; a second tenant fails closed.
  INSERT INTO private.nova_order_capacity_accounts (tenant_id, account_login, account_server)
  VALUES (p_tenant_id, p_account_login, p_account_server)
  ON CONFLICT DO NOTHING;

  SELECT tenant_id INTO v_owner_tenant_id
  FROM private.nova_order_capacity_accounts
  WHERE account_login = p_account_login
    AND account_server = p_account_server
  FOR UPDATE;

  IF NOT FOUND OR v_owner_tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN false;
  END IF;

  -- Revalidate only after obtaining the account lock. A snapshot that was
  -- fresh before lock contention may be stale by the time capacity is read.
  IF p_snapshot_at > pg_catalog.clock_timestamp() + interval '1 second'
     OR p_snapshot_at < pg_catalog.clock_timestamp() - interval '5 seconds'
  THEN
    RETURN false;
  END IF;

  DELETE FROM private.nova_order_capacity_reservations
  WHERE tenant_id = p_tenant_id
    AND account_login = p_account_login
    AND account_server = p_account_server
    AND broker_order_ticket IS NULL
    AND expires_at <= pg_catalog.clock_timestamp();

  SELECT count(*)::integer INTO v_active_reservations
  FROM private.nova_order_capacity_reservations
  WHERE tenant_id = p_tenant_id
    AND account_login = p_account_login
    AND account_server = p_account_server;

  IF p_open_positions + p_open_pending_orders + v_active_reservations >= 5 THEN
    RETURN false;
  END IF;

  INSERT INTO private.nova_order_capacity_reservations (
    reservation_id, tenant_id, account_login, account_server, command_id, expires_at
  )
  VALUES (
    p_reservation_id, p_tenant_id, p_account_login, p_account_server, p_command_id,
    pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => p_lease_seconds)
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_nova_order_reservation(
  p_tenant_id uuid,
  p_account_login bigint,
  p_account_server text,
  p_reservation_id uuid,
  p_broker_order_ticket text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_owner_tenant_id uuid;
  v_updated integer;
BEGIN
  IF p_broker_order_ticket IS NULL OR char_length(btrim(p_broker_order_ticket)) = 0 THEN
    RETURN false;
  END IF;

  SELECT tenant_id INTO v_owner_tenant_id
  FROM private.nova_order_capacity_accounts
  WHERE account_login = p_account_login AND account_server = p_account_server
  FOR UPDATE;
  IF NOT FOUND OR v_owner_tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN false;
  END IF;

  UPDATE private.nova_order_capacity_reservations
  SET broker_order_ticket = p_broker_order_ticket, expires_at = NULL
  WHERE reservation_id = p_reservation_id
    AND tenant_id = p_tenant_id
    AND account_login = p_account_login
    AND account_server = p_account_server
    AND broker_order_ticket IS NULL
    AND expires_at > pg_catalog.clock_timestamp();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_failed_nova_order_reservation(
  p_tenant_id uuid,
  p_account_login bigint,
  p_account_server text,
  p_reservation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_owner_tenant_id uuid;
  v_deleted integer;
BEGIN
  SELECT tenant_id INTO v_owner_tenant_id
  FROM private.nova_order_capacity_accounts
  WHERE account_login = p_account_login AND account_server = p_account_server
  FOR UPDATE;
  IF NOT FOUND OR v_owner_tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN false;
  END IF;

  DELETE FROM private.nova_order_capacity_reservations
  WHERE reservation_id = p_reservation_id
    AND tenant_id = p_tenant_id
    AND account_login = p_account_login
    AND account_server = p_account_server
    AND broker_order_ticket IS NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_nova_order_reservations(
  p_tenant_id uuid,
  p_account_login bigint,
  p_account_server text,
  p_confirmed_broker_tickets text[],
  p_open_positions integer,
  p_open_pending_orders integer,
  p_snapshot_at timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_owner_tenant_id uuid;
  v_released integer;
BEGIN
  IF p_tenant_id IS NULL OR p_account_login IS NULL OR p_account_login <= 0
     OR p_account_server IS NULL
     OR p_confirmed_broker_tickets IS NULL
     OR p_open_positions IS NULL OR p_open_positions < 0
     OR p_open_pending_orders IS NULL OR p_open_pending_orders < 0
     OR p_open_positions + p_open_pending_orders > 5
     OR pg_catalog.cardinality(p_confirmed_broker_tickets) > p_open_positions + p_open_pending_orders
     OR EXISTS (
       SELECT 1 FROM pg_catalog.unnest(p_confirmed_broker_tickets) AS t(ticket)
       WHERE t.ticket IS NULL OR pg_catalog.btrim(t.ticket) = ''
     )
     OR p_snapshot_at IS NULL
     OR p_snapshot_at > pg_catalog.clock_timestamp() + interval '1 second'
     OR p_snapshot_at < pg_catalog.clock_timestamp() - interval '5 seconds'
  THEN
    RETURN 0;
  END IF;

  SELECT tenant_id INTO v_owner_tenant_id
  FROM private.nova_order_capacity_accounts
  WHERE account_login = p_account_login AND account_server = p_account_server
  FOR UPDATE;
  IF NOT FOUND OR v_owner_tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN 0;
  END IF;

  -- Revalidate freshness after waiting for the account lock as well.
  IF p_snapshot_at > pg_catalog.clock_timestamp() + interval '1 second'
     OR p_snapshot_at < pg_catalog.clock_timestamp() - interval '5 seconds'
  THEN
    RETURN 0;
  END IF;

  DELETE FROM private.nova_order_capacity_reservations
  WHERE tenant_id = p_tenant_id
    AND account_login = p_account_login
    AND account_server = p_account_server
    AND broker_order_ticket = ANY (p_confirmed_broker_tickets);
  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_nova_order_capacity(
  uuid, bigint, text, uuid, uuid, integer, integer, timestamptz, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_nova_order_reservation(uuid, bigint, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_failed_nova_order_reservation(uuid, bigint, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_nova_order_reservations(
  uuid, bigint, text, text[], integer, integer, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_nova_order_capacity(
  uuid, bigint, text, uuid, uuid, integer, integer, timestamptz, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_nova_order_reservation(uuid, bigint, text, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_failed_nova_order_reservation(uuid, bigint, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_nova_order_reservations(
  uuid, bigint, text, text[], integer, integer, timestamptz
) TO service_role;

COMMENT ON TABLE private.nova_order_capacity_reservations IS
  'Account-wide reservations that serialize NOVA capacity checks; this table does not represent broker order execution.';
