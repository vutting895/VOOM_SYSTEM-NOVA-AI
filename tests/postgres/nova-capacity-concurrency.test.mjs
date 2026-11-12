import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { randomUUID } from "node:crypto";

const connectionString = process.env.NOVA_TEST_DATABASE_URL;
if (!connectionString) throw new Error("NOVA_TEST_DATABASE_URL is required for disposable PostgreSQL tests.");

const migration = await readFile(
  new URL("../../supabase/migrations/202611120002_nova_atomic_account_capacity.sql", import.meta.url),
  "utf8"
);

function client(applicationName) {
  return new Client({ connectionString, application_name: applicationName });
}

async function connectAsServiceRole(applicationName) {
  const c = client(applicationName);
  await c.connect();
  await c.query("SET ROLE service_role");
  return c;
}

async function reserve(c, { tenant, login, server, command = randomUUID(), reservation = randomUUID(), positions = 4, pending = 0, snapshot = new Date() }) {
  const result = await c.query(
    "SELECT public.reserve_nova_order_capacity($1,$2,$3,$4,$5,$6,$7,$8,30) AS accepted",
    [tenant, login, server, command, reservation, positions, pending, snapshot]
  );
  return result.rows[0].accepted;
}

async function waitForLockWait(observer, applicationName) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await observer.query(
      "SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock' LIMIT 1",
      [applicationName]
    );
    if (result.rowCount === 1) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for reservation session to block on the account row lock.");
}

const admin = client("nova-capacity-test-admin");
await admin.connect();
try {
  await admin.query("DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");
  await admin.query("DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");
  await admin.query("DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");
  await admin.query(migration);
  await admin.query("TRUNCATE private.nova_order_capacity_reservations, private.nova_order_capacity_accounts CASCADE");

  // Global ownership: the same broker account cannot acquire a second tenant pool.
  {
    const a = await connectAsServiceRole("nova-capacity-owner-a");
    const b = await connectAsServiceRole("nova-capacity-owner-b");
    try {
      const login = 981001;
      const server = "NOVA-OWNERSHIP-TEST";
      const first = await reserve(a, { tenant: randomUUID(), login, server, positions: 0 });
      assert.equal(first, true, "first tenant should claim an unowned broker account");
      const second = await reserve(b, { tenant: randomUUID(), login, server, positions: 0 });
      assert.equal(second, false, "a second tenant must not create a separate capacity pool");
    } finally {
      await a.end();
      await b.end();
    }
  }

  // True multi-session race: with exposure=4, exactly one of two simultaneous
  // reservation requests may consume the fifth and final slot.
  {
    const tenant = randomUUID();
    const login = 981002;
    const server = "NOVA-CONCURRENCY-TEST";
    const a = await connectAsServiceRole("nova-capacity-race-a");
    const b = await connectAsServiceRole("nova-capacity-race-b");
    try {
      const outcomes = await Promise.all([
        reserve(a, { tenant, login, server, positions: 4 }),
        reserve(b, { tenant, login, server, positions: 4 })
      ]);
      assert.equal(outcomes.filter(Boolean).length, 1, `expected one winner, got ${JSON.stringify(outcomes)}`);
    } finally {
      await a.end();
      await b.end();
    }
  }

  // Snapshot age must be checked again after waiting for the account lock.
  {
    const tenant = randomUUID();
    const login = 981003;
    const server = "NOVA-STALE-LOCK-TEST";
    const seed = await connectAsServiceRole("nova-capacity-stale-seed");
    const locker = client("nova-capacity-stale-locker");
    const contender = await connectAsServiceRole("nova-capacity-stale-contender");
    try {
      assert.equal(await reserve(seed, { tenant, login, server, positions: 0 }), true);
      await locker.connect();
      await locker.query("BEGIN");
      await locker.query(
        "SELECT 1 FROM private.nova_order_capacity_accounts WHERE account_login=$1 AND account_server=$2 FOR UPDATE",
        [login, server]
      );
      const snapshot = new Date();
      const pending = reserve(contender, { tenant, login, server, positions: 0, snapshot });
      await waitForLockWait(admin, "nova-capacity-stale-contender");
      await new Promise(resolve => setTimeout(resolve, 5200));
      await locker.query("COMMIT");
      assert.equal(await pending, false, "snapshot that aged beyond five seconds while waiting must be rejected");
    } finally {
      try { await locker.query("ROLLBACK"); } catch {}
      await seed.end();
      await locker.end();
      await contender.end();
    }
  }

  // Reservation lifecycle: confirm only a broker ticket, then reconcile only
  // when that ticket is supplied by a fresh authenticated snapshot.
  {
    const c = await connectAsServiceRole("nova-capacity-lifecycle");
    try {
      const tenant = randomUUID();
      const login = 981004;
      const server = "NOVA-LIFECYCLE-TEST";
      const reservation = randomUUID();
      assert.equal(await reserve(c, { tenant, login, server, positions: 0, reservation }), true);
      const confirmed = await c.query(
        "SELECT public.confirm_nova_order_reservation($1,$2,$3,$4,$5) AS ok",
        [tenant, login, server, reservation, "TICKET-981004"]
      );
      assert.equal(confirmed.rows[0].ok, true);
      const reconciled = await c.query(
        "SELECT public.reconcile_nova_order_reservations($1,$2,$3,$4,$5,$6,$7) AS released",
        [tenant, login, server, ["TICKET-981004"], 1, 0, new Date()]
      );
      assert.equal(reconciled.rows[0].released, 1);
    } finally {
      await c.end();
    }
  }

  console.log("PASS: global account ownership isolation");
  console.log("PASS: two-session race admits exactly one reservation at exposure 4");
  console.log("PASS: stale broker snapshot rejected after account-lock wait");
  console.log("PASS: broker confirmation and snapshot reconciliation lifecycle");
} finally {
  await admin.end();
}
