import unittest
from datetime import datetime, timedelta, timezone

from integrations.mt5.nova_position_lifecycle import (
    CloseIntent, PositionSnapshot, plan_owned_position_closes,
)


class NovaPositionClosePlannerTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.intent = CloseIntent(
            "close-001", "tenant-A", 123456, "Exness-MT5Trial",
            (7001, 7002), self.now - timedelta(seconds=1),
            self.now + timedelta(seconds=10),
        )
        self.positions = [
            PositionSnapshot(7001, "XAUUSDm", 690711000, 0.01, 123456, "Exness-MT5Trial"),
            PositionSnapshot(7002, "XAUUSDm", 690711001, 0.02, 123456, "Exness-MT5Trial"),
        ]
        self.kw = dict(
            expected_tenant_id="tenant-A",
            expected_login=123456,
            expected_server="Exness-MT5Trial",
            consumed_command_ids=set(),
            now=self.now,
        )

    def test_valid_plan_contains_only_requested_nova_tickets(self):
        plan = plan_owned_position_closes(self.intent, self.positions, **self.kw)
        self.assertTrue(plan.allowed)
        self.assertEqual(plan.position_tickets, (7001, 7002))

    def test_duplicate_command_is_rejected(self):
        kw = {**self.kw, "consumed_command_ids": {"close-001"}}
        self.assertEqual(
            plan_owned_position_closes(self.intent, self.positions, **kw).reason,
            "duplicate_or_missing_command_id",
        )

    def test_foreign_magic_is_never_planned(self):
        positions = [self.positions[0], PositionSnapshot(
            7002, "XAUUSDm", 12345, 0.02, 123456, "Exness-MT5Trial"
        )]
        self.assertEqual(
            plan_owned_position_closes(self.intent, positions, **self.kw).reason,
            "position_not_nova_owned",
        )

    def test_foreign_account_is_rejected(self):
        positions = [PositionSnapshot(
            7001, "XAUUSDm", 690711000, 0.01, 999999, "Exness-MT5Trial"
        ), self.positions[1]]
        self.assertEqual(
            plan_owned_position_closes(self.intent, positions, **self.kw).reason,
            "position_account_mismatch",
        )

    def test_tenant_mismatch_is_rejected(self):
        intent = CloseIntent(**{**self.intent.__dict__, "tenant_id": "tenant-B"})
        self.assertEqual(
            plan_owned_position_closes(intent, self.positions, **self.kw).reason,
            "tenant_mismatch",
        )

    def test_missing_ticket_is_rejected(self):
        positions = [self.positions[0]]
        self.assertEqual(
            plan_owned_position_closes(self.intent, positions, **self.kw).reason,
            "position_not_found_or_already_closed",
        )

    def test_duplicate_requested_ticket_is_rejected(self):
        intent = CloseIntent(**{**self.intent.__dict__, "position_tickets": (7001, 7001)})
        self.assertEqual(
            plan_owned_position_closes(intent, self.positions, **self.kw).reason,
            "duplicate_position_ticket",
        )

    def test_empty_request_is_rejected(self):
        intent = CloseIntent(**{**self.intent.__dict__, "position_tickets": ()})
        self.assertEqual(
            plan_owned_position_closes(intent, self.positions, **self.kw).reason,
            "empty_close_request",
        )

    def test_expired_request_is_rejected(self):
        intent = CloseIntent(**{
            **self.intent.__dict__, "expires_at": self.now - timedelta(seconds=1)
        })
        self.assertEqual(
            plan_owned_position_closes(intent, self.positions, **self.kw).reason,
            "intent_expired_or_from_future",
        )

    def test_excessive_ttl_is_rejected(self):
        intent = CloseIntent(**{
            **self.intent.__dict__, "expires_at": self.now + timedelta(minutes=2)
        })
        self.assertEqual(
            plan_owned_position_closes(intent, self.positions, **self.kw).reason,
            "intent_ttl_invalid",
        )


    def test_non_numeric_position_volume_is_rejected(self):
        positions = [PositionSnapshot(
            7001, "XAUUSDm", 690711000, "0.01", 123456, "Exness-MT5Trial"
        ), self.positions[1]]
        self.assertEqual(
            plan_owned_position_closes(self.intent, positions, **self.kw).reason,
            "invalid_position_snapshot",
        )

    def test_duplicate_snapshot_ticket_is_rejected(self):
        positions = [self.positions[0], self.positions[0], self.positions[1]]
        self.assertEqual(
            plan_owned_position_closes(self.intent, positions, **self.kw).reason,
            "duplicate_snapshot_ticket",
        )

    def test_malformed_snapshot_object_is_rejected(self):
        positions = [self.positions[0], object()]
        self.assertEqual(
            plan_owned_position_closes(self.intent, positions, **self.kw).reason,
            "invalid_position_snapshot",
        )

    def test_invalid_position_volume_is_rejected(self):
        positions = [PositionSnapshot(
            7001, "XAUUSDm", 690711000, float("inf"), 123456, "Exness-MT5Trial"
        ), self.positions[1]]
        self.assertEqual(
            plan_owned_position_closes(self.intent, positions, **self.kw).reason,
            "invalid_position_snapshot",
        )


if __name__ == "__main__":
    unittest.main()
