-- Transactional integration checks for account-wide capacity reservation.
-- Run only against a disposable test database with this migration applied.
BEGIN;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_login bigint := 987654321;
  v_server text := 'NOVA-CAPACITY-TEST';
  v_command_1 uuid := gen_random_uuid();
  v_reservation_1 uuid := gen_random_uuid();
  v_command_2 uuid := gen_random_uuid();
  v_reservation_2 uuid := gen_random_uuid();
  v_allowed boolean;
  v_released integer;
BEGIN
  -- 3 positions + 1 pending = 4; one reservation fills the final slot.
  v_allowed := private.reserve_nova_order_capacity(
    v_tenant, v_login, v_server, v_command_1, v_reservation_1,
    3, 1, clock_timestamp(), 30
  );
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'expected first reservation to be accepted at exposure 4';
  END IF;

  -- A second concurrent caller sees the first reservation under the same
  -- account row lock and is denied: 3 + 1 + 1 reservation = 5.
  v_allowed := private.reserve_nova_order_capacity(
    v_tenant, v_login, v_server, v_command_2, v_reservation_2,
    3, 1, clock_timestamp(), 30
  );
  IF v_allowed THEN
    RAISE EXCEPTION 'expected second reservation to be denied at effective exposure 5';
  END IF;

  -- Confirm broker acceptance; keep reservation until a fresh snapshot
  -- proves that the returned ticket is reflected in positions/pending.
  IF NOT private.confirm_nova_order_reservation(
    v_tenant, v_login, v_server, v_reservation_1, 'TEST-TICKET-1'
  ) THEN
    RAISE EXCEPTION 'expected reservation confirmation';
  END IF;

  v_released := private.reconcile_nova_order_reservations(
    v_tenant, v_login, v_server, ARRAY['TEST-TICKET-1'],
    3, 2, clock_timestamp()
  );
  IF v_released <> 1 THEN
    RAISE EXCEPTION 'expected exactly one broker-confirmed reservation to reconcile';
  END IF;

  -- Actual broker exposure is now 5, so no new reservation may be created.
  v_allowed := private.reserve_nova_order_capacity(
    v_tenant, v_login, v_server, v_command_2, v_reservation_2,
    3, 2, clock_timestamp(), 30
  );
  IF v_allowed THEN
    RAISE EXCEPTION 'expected denial at broker exposure 5';
  END IF;

  -- Explicit broker rejection safely releases an unconfirmed reservation.
  v_allowed := private.reserve_nova_order_capacity(
    v_tenant, v_login, v_server, gen_random_uuid(), v_reservation_2,
    2, 1, clock_timestamp(), 30
  );
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'expected capacity after confirmed broker exposure dropped to 3';
  END IF;
  IF NOT private.release_failed_nova_order_reservation(
    v_tenant, v_login, v_server, v_reservation_2
  ) THEN
    RAISE EXCEPTION 'expected failed submission reservation to release';
  END IF;
END;
$$;

ROLLBACK;
