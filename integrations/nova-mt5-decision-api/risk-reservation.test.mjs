import test from "node:test";
import assert from "node:assert/strict";
import { RiskReservation } from "./risk-reservation.js";

function makeObject() {
  let state = new Map();
  let lock = Promise.resolve();
  const storage = {
    async transaction(callback) {
      let release;
      const previous = lock;
      lock = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        const staged = new Map(state);
        const tx = {
          get: async (key) => structuredClone(staged.get(key)),
          put: async (key, value) => staged.set(key, structuredClone(value)),
          delete: async (key) => staged.delete(key),
        };
        const result = await callback(tx);
        state = staged;
        return result;
      } finally { release(); }
    },
    async setAlarm() {},
  };
  return new RiskReservation({ storage });
}
const base = (overrides = {}) => ({
  event_id: "XAUUSDm-PERIOD_M15-1794550000",
  claim_id: "claim-000000000001",
  policy_version: "nova-mt5-risk.v2",
  account_currency: "USD",
  snapshot_at: new Date().toISOString(),
  broker_day_start_at: new Date(Date.now() - 60_000).toISOString(),
  broker_day_baseline_capture_delay_seconds: 10,
  broker_day_baseline_available: true,
  candidate_risk_complete: true,
  current_equity: 9900,
  aggregate_open_risk_money: 691,
  open_orders_count: 2,
  broker_day_start_equity: 10000,
  proposed_entry_risk_money: 200,
  ...overrides,
});
const post = (object, path, body) => object.fetch(new Request("https://risk-reservations.test" + path, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}));

test("atomic account reservation prevents two concurrent entries consuming the same risk capacity", async () => {
  const object = makeObject();
  const [first, second] = await Promise.all([
    post(object, "/reserve", base({ claim_id: "claim-000000000001" })),
    post(object, "/reserve", base({ event_id: "XAUUSDm-PERIOD_M5-1794550060", claim_id: "claim-000000000002" })),
  ]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [201, 409]);
  const denied = await (first.status === 409 ? first : second).json();
  assert.equal(denied.error, "aggregate_open_risk_limit_exceeded");
});

test("reservation release is owner-checked and restores capacity", async () => {
  const object = makeObject();
  const reserved = await post(object, "/reserve", base());
  assert.equal(reserved.status, 201);
  const wrongOwner = await post(object, "/release", {
    event_id: base().event_id, claim_id: "claim-000000000099",
  });
  assert.equal(wrongOwner.status, 409);
  const released = await post(object, "/release", {
    event_id: base().event_id, claim_id: base().claim_id,
  });
  assert.equal(released.status, 200);
  assert.equal((await post(object, "/reserve", base({ claim_id: "claim-000000000002" }))).status, 201);
});

test("daily loss threshold and max order count fail closed", async () => {
  const dailyLock = await post(makeObject(), "/reserve", base({ current_equity: 9000 }));
  assert.equal(dailyLock.status, 409);
  assert.equal((await dailyLock.json()).error, "daily_loss_entry_lock");

  const maxOrders = await post(makeObject(), "/reserve", base({ open_orders_count: 5 }));
  assert.equal(maxOrders.status, 409);
  assert.equal((await maxOrders.json()).error, "max_open_orders_reached");
});

test("committed reservation persists until broker reconciliation observes its ticket", async () => {
  const object = makeObject();
  assert.equal((await post(object, "/reserve", base())).status, 201);
  assert.equal((await post(object, "/commit", {
    event_id: base().event_id, claim_id: base().claim_id, broker_ticket: "123456789",
  })).status, 200);

  const before = await post(object, "/reconcile", {
    broker_ticket_ids: ["987654321"], snapshot_at: new Date().toISOString(),
  });
  assert.deepEqual(await before.json(), { reconciled: 0, remaining_committed: 1 });

  const after = await post(object, "/reconcile", {
    broker_ticket_ids: ["123456789"], snapshot_at: new Date().toISOString(),
  });
  assert.deepEqual(await after.json(), { reconciled: 1, remaining_committed: 0 });
});
