"""Static invariants for the follow-up account-wide reservation migration.

These tests do not prove PostgreSQL concurrency. A disposable PostgreSQL multi-session
race test remains a release gate and is deliberately not inferred from source order.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / "supabase/migrations/202611120002_nova_atomic_account_capacity.sql"


class AtomicCapacityMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = SQL_PATH.read_text(encoding="utf-8")
        cls.reserve = cls.sql.split(
            "CREATE OR REPLACE FUNCTION public.reserve_nova_order_capacity", 1
        )[1].split("CREATE OR REPLACE FUNCTION public.confirm_nova_order_reservation", 1)[0]
        cls.reconcile = cls.sql.split(
            "CREATE OR REPLACE FUNCTION public.reconcile_nova_order_reservations", 1
        )[1].split("REVOKE ALL ON FUNCTION", 1)[0]

    def test_global_account_identity_is_unique_even_if_ledger_preexists(self):
        self.assertIn(
            "CREATE UNIQUE INDEX IF NOT EXISTS nova_order_capacity_account_global_owner_idx",
            self.sql,
        )
        self.assertIn("ON private.nova_order_capacity_accounts (account_login, account_server)", self.sql)

    def test_reservation_checks_single_global_tenant_owner(self):
        self.assertIn("WHERE account_login = p_account_login", self.reserve)
        self.assertIn("AND account_server = p_account_server", self.reserve)
        self.assertIn("v_owner_tenant_id IS DISTINCT FROM p_tenant_id", self.reserve)

    def test_lock_precedes_freshness_revalidation_and_capacity_count(self):
        lock_at = self.reserve.index("FOR UPDATE;")
        freshness_at = self.reserve.index("p_snapshot_at < pg_catalog.clock_timestamp() - interval '5 seconds'", lock_at)
        count_at = self.reserve.index("SELECT count(*)::integer INTO v_active_reservations")
        insert_at = self.reserve.index("INSERT INTO private.nova_order_capacity_reservations")
        self.assertLess(lock_at, freshness_at)
        self.assertLess(freshness_at, count_at)
        self.assertLess(count_at, insert_at)

    def test_capacity_is_account_wide_positions_plus_pending_plus_reservations(self):
        self.assertIn(
            "p_open_positions + p_open_pending_orders + v_active_reservations >= 5",
            self.reserve,
        )

    def test_reconciliation_validates_snapshot_after_lock(self):
        lock_at = self.reconcile.index("FOR UPDATE;")
        fresh_at = self.reconcile.index("p_snapshot_at < pg_catalog.clock_timestamp() - interval '5 seconds'", lock_at)
        delete_at = self.reconcile.index("DELETE FROM private.nova_order_capacity_reservations")
        self.assertLess(lock_at, fresh_at)
        self.assertLess(fresh_at, delete_at)

    def test_service_role_only_and_no_order_execution(self):
        self.assertIn("REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated", self.sql)
        self.assertIn("TO service_role", self.sql)
        self.assertNotRegex(self.sql.lower(), r"\b(order_send|ordersend|mt5\.order_send)\b")


if __name__ == "__main__":
    unittest.main()
