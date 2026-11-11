"""Static safety checks for the NOVA account-wide reservation migration.

These checks are not a substitute for running the SQL integration test against
PostgreSQL or exercising simultaneous sessions.
"""
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/202611120001_nova_account_order_capacity_reservations.sql"
SQL_TEST = ROOT / "tests/sql/nova_order_capacity_reservations.integration.sql"


class NovaOrderCapacityMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8")
        cls.integration = SQL_TEST.read_text(encoding="utf-8")

    def test_all_plpgsql_dollar_quotes_are_balanced(self):
        # Every PL/pgSQL body in this migration uses the same explicit tag.
        self.assertEqual(self.sql.count("AS $$"), 4)
        self.assertEqual(self.sql.count("\n$$;"), 4)
        self.assertNotRegex(self.sql, r"(?m)^AS \$$")

    def test_capacity_decision_is_serialized_by_account_row_lock(self):
        reserve = self.sql.split("CREATE OR REPLACE FUNCTION public.reserve_nova_order_capacity", 1)[1]
        lock_at = reserve.index("FOR UPDATE;")
        count_at = reserve.index("SELECT count(*)::integer INTO v_active_reservations")
        insert_at = reserve.index("INSERT INTO private.nova_order_capacity_reservations")
        self.assertLess(lock_at, count_at)
        self.assertLess(count_at, insert_at)
        self.assertIn("p_open_positions + p_open_pending_orders + v_active_reservations >= 5", reserve)

    def test_rpc_execution_is_service_role_only(self):
        for function in (
            "reserve_nova_order_capacity",
            "confirm_nova_order_reservation",
            "release_failed_nova_order_reservation",
            "reconcile_nova_order_reservations",
        ):
            self.assertRegex(
                self.sql,
                rf"REVOKE ALL ON FUNCTION public\\.{function}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated;",
            )
            self.assertRegex(
                self.sql,
                rf"GRANT EXECUTE ON FUNCTION public\\.{function}\\([\\s\\S]*?TO service_role;",
            )

    def test_reservation_requires_fresh_snapshot_and_bounded_lease(self):
        reserve = self.sql.split("CREATE OR REPLACE FUNCTION public.reserve_nova_order_capacity", 1)[1]
        self.assertIn("clock_timestamp() - interval '5 seconds'", reserve)
        self.assertIn("p_lease_seconds NOT BETWEEN 1 AND 60", reserve)
        self.assertIn("expires_at <= pg_catalog.clock_timestamp()", reserve)

    def test_confirmation_does_not_expire_until_broker_snapshot_reconciles(self):
        confirm = self.sql.split("CREATE OR REPLACE FUNCTION public.confirm_nova_order_reservation", 1)[1]
        self.assertIn("expires_at = NULL", confirm)
        self.assertIn("broker_order_ticket = p_broker_order_ticket", confirm)
        reconcile = self.sql.split("CREATE OR REPLACE FUNCTION public.reconcile_nova_order_reservations", 1)[1]
        self.assertIn("broker_order_ticket = ANY (p_confirmed_broker_tickets)", reconcile)

    def test_sql_integration_script_rolls_back_and_checks_capacity_boundaries(self):
        self.assertTrue(self.integration.lstrip().startswith("BEGIN;"))
        self.assertTrue(self.integration.rstrip().endswith("ROLLBACK;"))
        self.assertIn("expected first reservation to be accepted", self.integration)
        self.assertIn("expected second reservation to be denied", self.integration)
        self.assertIn("expected denial at broker exposure 5", self.integration)
        self.assertIn("release_failed_nova_order_reservation", self.integration)


if __name__ == "__main__":
    unittest.main()
