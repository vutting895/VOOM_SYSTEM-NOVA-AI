const PROCESSING_LEASE_MS = 90_000;
const POLICY_VERSION = "nova-mt5-risk.v2";
const DAILY_LOSS_LIMIT_PCT = 10;
const AGGREGATE_RISK_LIMIT_PCT = 9;
const MAX_OPEN_ORDERS = 5;
const MAX_SNAPSHOT_AGE_MS = 60_000;
const STORAGE_KEY = "account_risk_reservations";

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});
const finitePositive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
const validId = (value) => typeof value === "string" && /^[A-Za-z0-9._:-]{12,128}$/.test(value);

export class RiskReservation {
  constructor(ctx) {
    this.ctx = ctx;
    this.storage = ctx.storage;
  }

  async fetch(request) {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const path = new URL(request.url).pathname;
    if (!["/reserve", "/commit", "/release", "/reconcile"].includes(path)) {
      return json({ error: "not_found" }, 404);
    }
    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }

    if (path === "/reserve") return this.reserve(body);
    if (path === "/commit") return this.commit(body);
    if (path === "/release") return this.release(body);
    return this.reconcile(body);
  }

  async reserve(body) {
    const required = [
      "event_id", "claim_id", "policy_version", "account_currency", "snapshot_at",
      "broker_day_start_at", "broker_day_baseline_capture_delay_seconds",
      "broker_day_baseline_available", "candidate_risk_complete",
      "current_equity", "aggregate_open_risk_money", "open_orders_count",
      "broker_day_start_equity", "proposed_entry_risk_money",
    ];
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some((key) => !required.includes(key)) ||
        required.some((key) => !Object.hasOwn(body, key)) ||
        !validId(body.event_id) || !validId(body.claim_id) ||
        body.policy_version !== POLICY_VERSION ||
        typeof body.account_currency !== "string" || !/^[A-Z]{3,8}$/.test(body.account_currency) ||
        typeof body.broker_day_baseline_available !== "boolean" ||
        body.broker_day_baseline_available !== true ||
        body.candidate_risk_complete !== true ||
        !finitePositive(body.current_equity) ||
        !finitePositive(body.broker_day_start_equity) ||
        !Number.isFinite(body.aggregate_open_risk_money) || body.aggregate_open_risk_money < 0 ||
        !Number.isInteger(body.open_orders_count) || body.open_orders_count < 0 ||
        !finitePositive(body.proposed_entry_risk_money) ||
        !Number.isFinite(body.broker_day_baseline_capture_delay_seconds) ||
        body.broker_day_baseline_capture_delay_seconds < 0 ||
        body.broker_day_baseline_capture_delay_seconds > 30 ||
        !Number.isFinite(Date.parse(body.snapshot_at)) ||
        !Number.isFinite(Date.parse(body.broker_day_start_at))) {
      return json({ error: "invalid_risk_reservation_request" }, 400);
    }

    const now = Date.now();
    const snapshotAge = now - Date.parse(body.snapshot_at);
    if (snapshotAge < -5_000 || snapshotAge > MAX_SNAPSHOT_AGE_MS) {
      return json({ error: "risk_reservation_snapshot_stale" }, 409);
    }
    const dailyLossPct = Math.max(
      0,
      (body.broker_day_start_equity - body.current_equity) / body.broker_day_start_equity * 100,
    );
    if (dailyLossPct >= DAILY_LOSS_LIMIT_PCT) {
      return json({ error: "daily_loss_entry_lock", daily_loss_pct: dailyLossPct }, 409);
    }

    const outcome = await this.storage.transaction(async (txn) => {
      const stored = await txn.get(STORAGE_KEY);
      const reservations = Array.isArray(stored) ? stored : [];
      const active = reservations.filter((item) =>
        item.status === "committed" || item.expires_at_ms > now);
      const reservedRisk = active.reduce((sum, item) => sum + item.risk_money, 0);
      const reservedOrders = active.length;
      const riskLimit = body.current_equity * AGGREGATE_RISK_LIMIT_PCT / 100;
      const totalRisk = body.aggregate_open_risk_money + reservedRisk + body.proposed_entry_risk_money;
      if (body.open_orders_count + reservedOrders >= MAX_OPEN_ORDERS) {
        await txn.put(STORAGE_KEY, active);
        return { accepted: false, error: "max_open_orders_reached", reserved_orders: reservedOrders };
      }
      if (totalRisk > riskLimit + 1e-9) {
        await txn.put(STORAGE_KEY, active);
        return {
          accepted: false, error: "aggregate_open_risk_limit_exceeded",
          risk_limit_money: riskLimit, total_risk_money: totalRisk,
        };
      }
      if (active.some((item) => item.claim_id === body.claim_id)) {
        return { accepted: false, error: "risk_reservation_already_exists" };
      }
      active.push({
        event_id: body.event_id,
        claim_id: body.claim_id,
        risk_money: body.proposed_entry_risk_money,
        account_currency: body.account_currency,
        policy_version: POLICY_VERSION,
        status: "processing",
        created_at_ms: now,
        expires_at_ms: now + PROCESSING_LEASE_MS,
      });
      await txn.put(STORAGE_KEY, active);
      return {
        accepted: true, reserved_risk_money: reservedRisk + body.proposed_entry_risk_money,
        total_risk_money: totalRisk, risk_limit_money: riskLimit,
        expires_at_ms: now + PROCESSING_LEASE_MS,
      };
    });

    if (!outcome.accepted) return json(outcome, 409);
    await this.storage.setAlarm(now + PROCESSING_LEASE_MS);
    return json({ reserved: true, ...outcome }, 201);
  }

  async commit(body) {
    if (!body || !validId(body.event_id) || !validId(body.claim_id) ||
        typeof body.broker_ticket !== "string" || !/^\d{1,24}$/.test(body.broker_ticket)) {
      return json({ error: "invalid_risk_reservation_commit" }, 400);
    }
    const result = await this.storage.transaction(async (txn) => {
      const items = await txn.get(STORAGE_KEY) || [];
      const item = items.find((entry) => entry.event_id === body.event_id &&
        entry.claim_id === body.claim_id && entry.status === "processing");
      if (!item || item.expires_at_ms <= Date.now()) return false;
      item.status = "committed";
      item.broker_ticket = body.broker_ticket;
      item.committed_at_ms = Date.now();
      item.expires_at_ms = null;
      await txn.put(STORAGE_KEY, items);
      return true;
    });
    return result ? json({ committed: true }) : json({ error: "reservation_not_owned_or_expired" }, 409);
  }

  async release(body) {
    if (!body || !validId(body.event_id) || !validId(body.claim_id)) {
      return json({ error: "invalid_risk_reservation_release" }, 400);
    }
    const result = await this.storage.transaction(async (txn) => {
      const items = await txn.get(STORAGE_KEY) || [];
      const index = items.findIndex((entry) => entry.event_id === body.event_id &&
        entry.claim_id === body.claim_id && entry.status === "processing");
      if (index < 0) return false;
      items.splice(index, 1);
      await txn.put(STORAGE_KEY, items);
      return true;
    });
    return result ? json({ released: true }) : json({ error: "reservation_not_owned" }, 409);
  }

  async reconcile(body) {
    if (!body || !Array.isArray(body.broker_ticket_ids) ||
        body.broker_ticket_ids.length > 500 ||
        body.broker_ticket_ids.some((ticket) => typeof ticket !== "string" || !/^\d{1,24}$/.test(ticket)) ||
        !Number.isFinite(Date.parse(body.snapshot_at)) ||
        Date.now() - Date.parse(body.snapshot_at) > MAX_SNAPSHOT_AGE_MS ||
        Date.parse(body.snapshot_at) - Date.now() > 5_000) {
      return json({ error: "invalid_broker_reconciliation_snapshot" }, 400);
    }
    const observed = new Set(body.broker_ticket_ids);
    const result = await this.storage.transaction(async (txn) => {
      const items = await txn.get(STORAGE_KEY) || [];
      const before = items.length;
      const remaining = items.filter((item) =>
        item.status !== "committed" || !observed.has(item.broker_ticket));
      await txn.put(STORAGE_KEY, remaining);
      return { reconciled: before - remaining.length, remaining_committed: remaining.filter((item) => item.status === "committed").length };
    });
    return json(result);
  }

  async alarm() {
    const now = Date.now();
    let nextAlarm = null;
    await this.storage.transaction(async (txn) => {
      const items = await txn.get(STORAGE_KEY) || [];
      const remaining = items.filter((item) => item.status === "committed" || item.expires_at_ms > now);
      await txn.put(STORAGE_KEY, remaining);
      const expiries = remaining.filter((item) => item.status === "processing").map((item) => item.expires_at_ms);
      if (expiries.length) nextAlarm = Math.min(...expiries);
    });
    if (nextAlarm !== null) await this.storage.setAlarm(nextAlarm);
  }
}
