import test from "node:test";
import assert from "node:assert/strict";
import { createRotationCoordinator } from "./rotation-lifecycle.mjs";

const binding = overrides => ({
  bindingId: "binding-a",
  ownerId: "owner-a",
  provider: "synthetic-provider",
  environment: "demo",
  credentialType: "api_key",
  generation: 1,
  activeVersionId: "version-1",
  state: "ACTIVE",
  rotationRequired: false,
  fencingToken: 0,
  ...overrides
});

function createStore(initial = binding()) {
  const bindings = new Map([[initial.bindingId, structuredClone(initial)]]);
  const operations = new Map();
  const leases = new Map();
  let fencingCounter = 0;

  return {
    async getBinding(id) {
      const value = bindings.get(id);
      return value ? structuredClone(value) : null;
    },
    async getOperation(id) {
      const value = operations.get(id);
      return value ? structuredClone(value) : null;
    },
    async reserveOperation({ operationId, fingerprint }) {
      const prior = operations.get(operationId);
      if (prior) {
        if (prior.fingerprint !== fingerprint) return { kind: "CONFLICT" };
        return { kind: prior.status === "COMPLETED" ? "CONFLICT" : "IN_PROGRESS" };
      }
      operations.set(operationId, { fingerprint, status: "RUNNING" });
      return { kind: "CLAIMED" };
    },
    async completeOperation(operationId, result) {
      const prior = operations.get(operationId);
      if (!prior || prior.status !== "RUNNING") throw new Error("OPERATION_NOT_RESERVED");
      operations.set(operationId, { ...prior, status: "COMPLETED", result: structuredClone(result) });
    },
    async abandonOperation(operationId) {
      const prior = operations.get(operationId);
      if (prior?.status === "RUNNING") operations.delete(operationId);
    },
    async acquireLease(bindingId, operationId) {
      if (leases.has(bindingId)) return null;
      const lease = {
        token: "lease-" + (++fencingCounter),
        fencingToken: fencingCounter,
        operationId
      };
      leases.set(bindingId, lease);
      return structuredClone(lease);
    },
    async releaseLease(bindingId, lease) {
      if (leases.get(bindingId)?.token === lease?.token) leases.delete(bindingId);
    },
    async compareAndSet(bindingId, expected, next, lease) {
      const current = bindings.get(bindingId);
      if (!current || current.generation !== expected.generation || current.state !== expected.state) return false;
      if (lease) {
        const active = leases.get(bindingId);
        if (!active || active.token !== lease.token ||
            active.fencingToken !== lease.fencingToken ||
            lease.fencingToken < (current.fencingToken || 0)) return false;
      }
      bindings.set(bindingId, {
        ...structuredClone(next),
        fencingToken: lease?.fencingToken ?? current.fencingToken ?? 0
      });
      return true;
    },
    async forceLeaseExpiry(bindingId) {
      leases.delete(bindingId);
      fencingCounter++;
    },
    inspectOperations() {
      return new Map(operations);
    }
  };
}

function createRegistry() {
  return {
    async resolve({ provider, environment, credentialType }) {
      if (provider !== "synthetic-provider" || environment !== "demo") return null;
      if (credentialType === "api_key") {
        return { rotationKind: "API_KEY_ROTATION", supportsRevoke: true };
      }
      if (credentialType === "oauth_refresh_token") {
        return { rotationKind: "OAUTH_REFRESH", supportsRevoke: true };
      }
      if (credentialType === "revoke_unsupported") {
        return { rotationKind: "API_KEY_ROTATION", supportsRevoke: false };
      }
      return null;
    }
  };
}

function createProvider(overrides = {}) {
  const calls = [];
  const provider = {
    async rotateApiKey(input) {
      calls.push({ method: "rotateApiKey", input });
      return { successorVersionId: "version-2" };
    },
    async refreshOAuthToken(input) {
      calls.push({ method: "refreshOAuthToken", input });
      return { successorVersionId: "oauth-version-2" };
    },
    async validateSuccessor(input) {
      calls.push({ method: "validateSuccessor", input });
      return true;
    },
    async reconcileRotation(input) {
      calls.push({ method: "reconcileRotation", input });
      return { status: "SUCCEEDED", successorVersionId: "version-2" };
    },
    async revokeApiKey(input) {
      calls.push({ method: "revokeApiKey", input });
    },
    async revokeOAuthGrant(input) {
      calls.push({ method: "revokeOAuthGrant", input });
    },
    ...overrides
  };
  return { provider, calls };
}

function coordinatorFor({ initial = binding(), registry = createRegistry(), providerOverrides = {}, storeOverrides = {} } = {}) {
  const store = { ...createStore(initial), ...storeOverrides };
  const { provider, calls } = createProvider(providerOverrides);
  const coordinator = createRotationCoordinator({ store, registry, provider });
  return { coordinator, store, provider, calls };
}

test("successful use requires rotation before the next use and retires the prior version atomically", async () => {
  const { coordinator, store, calls } = coordinatorFor();

  const used = await coordinator.markSuccessfulUse({
    bindingId: "binding-a", operationId: "use-000001", expectedGeneration: 1
  });
  assert.equal(used.state, "ROTATION_REQUIRED");
  assert.equal((await store.getBinding("binding-a")).state, "ROTATION_REQUIRED");

  const next = await coordinator.prepareNextUse({
    bindingId: "binding-a", operationId: "rotate-000001"
  });
  assert.equal(next.state, "ROTATED");
  assert.equal(next.generation, 2);
  assert.equal(next.activeVersionId, "version-2");

  const current = await store.getBinding("binding-a");
  assert.equal(current.state, "ACTIVE");
  assert.equal(current.rotationRequired, false);
  assert.equal(current.previousVersionId, "version-1");
  assert.equal(current.previousVersionState, "RETIRED");

  const ready = await coordinator.prepareNextUse({
    bindingId: "binding-a", operationId: "rotate-000002"
  });
  assert.equal(ready.state, "READY");
  assert.equal(ready.activeVersionId, "version-2");
  assert.equal(calls.filter(call => call.method === "rotateApiKey").length, 1);
});

test("OAuth credentials use refresh semantics, never the API-key rotation adapter", async () => {
  const initial = binding({ credentialType: "oauth_refresh_token" });
  const { coordinator, calls } = coordinatorFor({ initial });
  await coordinator.markSuccessfulUse({
    bindingId: "binding-a", operationId: "use-oauth-01", expectedGeneration: 1
  });
  const rotated = await coordinator.prepareNextUse({
    bindingId: "binding-a", operationId: "refresh-oauth-01"
  });
  assert.equal(rotated.state, "ROTATED");
  assert.equal(rotated.activeVersionId, "oauth-version-2");
  assert.equal(calls.some(call => call.method === "refreshOAuthToken"), true);
  assert.equal(calls.some(call => call.method === "rotateApiKey"), false);
});

test("provider without a safe rotation capability is explicitly unsupported and cannot fall back to the old version", async () => {
  const initial = binding({ credentialType: "unsupported" });
  const { coordinator, store, calls } = coordinatorFor({ initial });
  await coordinator.markSuccessfulUse({
    bindingId: "binding-a", operationId: "use-unsupported-01", expectedGeneration: 1
  });
  const blocked = await coordinator.prepareNextUse({
    bindingId: "binding-a", operationId: "rotate-unsupported-01"
  });
  assert.equal(blocked.state, "ROTATION_UNSUPPORTED");
  assert.equal(blocked.result_code, "ROTATION_UNSUPPORTED");
  const saved = await store.getBinding("binding-a");
  assert.equal(saved.activeVersionId, null);
  assert.equal(saved.blockedVersionId, "version-1");
  const retry = await coordinator.prepareNextUse({
    bindingId: "binding-a", operationId: "rotate-unsupported-02"
  });
  assert.equal(retry.state, "ROTATION_UNSUPPORTED");
  assert.equal(calls.some(call => call.method === "rotateApiKey"), false);
});

test("known rotation failure blocks the old version and never retries it as fallback", async () => {
  const { coordinator, store, calls } = coordinatorFor({
    providerOverrides: {
      async rotateApiKey(input) {
        calls.push({ method: "rotateApiKey", input });
        throw new Error("synthetic provider rejection");
      }
    }
  });
  await coordinator.markSuccessfulUse({
    bindingId: "binding-a", operationId: "use-fail-01", expectedGeneration: 1
  });
  const failed = await coordinator.prepareNextUse({
    bindingId: "binding-a", operationId: "rotate-fail-01"
  });
  assert.equal(failed.state, "ROTATION_FAILED");
  const saved = await store.getBinding("binding-a");
  assert.equal(saved.activeVersionId, null);
  assert.equal(saved.blockedVersionId, "version-1");
  const retry = await coordinator.prepareNextUse({
    bindingId: "binding-a", operationId: "rotate-fail-02"
  });
  assert.equal(retry.state, "ROTATION_FAILED");
  assert.equal(calls.filter(call => call.method === "rotateApiKey").length, 1);
});

test("ambiguous rotation is durable, blocks fallback, and only reconciliation can restore an active successor", async () => {
  const { coordinator, store, calls } = coordinatorFor({
    providerOverrides: {
      async rotateApiKey(input) {
        calls.push({ method: "rotateApiKey", input });
        const error = new Error("synthetic timeout after provider send");
        error.outcomeUnknown = true;
        throw error;
      }
    }
  });
  await coordinator.markSuccessfulUse({
    bindingId: "binding-a", operationId: "use-unknown-01", expectedGeneration: 1
  });
  const unknown = await coordinator.prepareNextUse({
    bindingId: "binding-a", operationId: "rotate-unknown-01"
  });
  assert.equal(unknown.state, "ROTATION_UNKNOWN");
  assert.equal(unknown.reconciliation_required, true);
  assert.equal((await store.getBinding("binding-a")).activeVersionId, null);

  const blocked = await coordinator.prepareNextUse({
    bindingId: "binding-a", operationId: "rotate-unknown-02"
  });
  assert.equal(blocked.state, "ROTATION_UNKNOWN");
  assert.equal(calls.filter(call => call.method === "rotateApiKey").length, 1);

  const reconciled = await coordinator.reconcileRotation({
    bindingId: "binding-a",
    operationId: "reconcile-unknown-01",
    originalOperationId: "rotate-unknown-01"
  });
  assert.equal(reconciled.state, "ROTATED");
  assert.equal(reconciled.activeVersionId, "version-2");
  const saved = await store.getBinding("binding-a");
  assert.equal(saved.state, "ACTIVE");
  assert.equal(saved.generation, 2);
  assert.equal(saved.activeVersionId, "version-2");
});

test("reconciliation that confirms no successor leaves the binding failed and does not reactivate the old version", async () => {
  const { coordinator, store } = coordinatorFor({
    providerOverrides: {
      async rotateApiKey() {
        const error = new Error("synthetic timeout");
        error.outcomeUnknown = true;
        throw error;
      },
      async reconcileRotation() {
        return { status: "NOT_APPLIED" };
      }
    }
  });
  await coordinator.markSuccessfulUse({
    bindingId: "binding-a", operationId: "use-not-applied-01", expectedGeneration: 1
  });
  await coordinator.prepareNextUse({ bindingId: "binding-a", operationId: "rotate-not-applied-01" });
  const reconciled = await coordinator.reconcileRotation({
    bindingId: "binding-a",
    operationId: "reconcile-not-applied-01",
    originalOperationId: "rotate-not-applied-01"
  });
  assert.equal(reconciled.state, "ROTATION_FAILED");
  const saved = await store.getBinding("binding-a");
  assert.equal(saved.activeVersionId, null);
  assert.equal(saved.blockedVersionId, "version-1");
});

test("concurrent next-use requests acquire one lease and invoke the provider once", async () => {
  let markStarted;
  let release;
  const started = new Promise(resolve => { markStarted = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const { coordinator, calls } = coordinatorFor({
    providerOverrides: {
      async rotateApiKey(input) {
        calls.push({ method: "rotateApiKey", input });
        markStarted();
        await gate;
        return { successorVersionId: "version-2" };
      }
    }
  });
  await coordinator.markSuccessfulUse({
    bindingId: "binding-a", operationId: "use-concurrent-01", expectedGeneration: 1
  });

  const firstPromise = coordinator.prepareNextUse({
    bindingId: "binding-a", operationId: "rotate-concurrent-01"
  });
  await started;
  const second = await coordinator.prepareNextUse({
    bindingId: "binding-a", operationId: "rotate-concurrent-02"
  });
  assert.equal(second.result_code, "ROTATION_LEASE_BUSY");
  release();
  const first = await firstPromise;
  assert.equal(first.state, "ROTATED");
  assert.equal(calls.filter(call => call.method === "rotateApiKey").length, 1);
});

test("idempotency replays the prior sanitized transition and rejects operation ID reuse for a different request", async () => {
  const { coordinator, calls } = coordinatorFor();
  const first = await coordinator.markSuccessfulUse({
    bindingId: "binding-a", operationId: "use-idempotent-01", expectedGeneration: 1
  });
  const replay = await coordinator.markSuccessfulUse({
    bindingId: "binding-a", operationId: "use-idempotent-01", expectedGeneration: 1
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.state, first.state);

  const conflict = await coordinator.markSuccessfulUse({
    bindingId: "binding-a", operationId: "use-idempotent-01", expectedGeneration: 2
  });
  assert.equal(conflict.result_code, "IDEMPOTENCY_CONFLICT");

  const rotated = await coordinator.prepareNextUse({
    bindingId: "binding-a", operationId: "rotate-idempotent-01"
  });
  const rotationReplay = await coordinator.prepareNextUse({
    bindingId: "binding-a", operationId: "rotate-idempotent-01"
  });
  assert.equal(rotationReplay.replayed, true);
  assert.equal(rotationReplay.activeVersionId, rotated.activeVersionId);
  assert.equal(calls.filter(call => call.method === "rotateApiKey").length, 1);
});

test("revoke retires the active version and never returns a credential value", async () => {
  const { coordinator, store, calls } = coordinatorFor();
  const revoked = await coordinator.revoke({
    bindingId: "binding-a", operationId: "revoke-000001"
  });
  assert.equal(revoked.state, "REVOKED");
  const saved = await store.getBinding("binding-a");
  assert.equal(saved.activeVersionId, null);
  assert.equal(saved.state, "REVOKED");
  assert.equal(calls.some(call => call.method === "revokeApiKey"), true);
  assert.equal(Object.hasOwn(revoked, "secret"), false);
});

test("provider without a safe revoke capability is blocked and reported explicitly", async () => {
  const initial = binding({ credentialType: "revoke_unsupported" });
  const { coordinator, store, calls } = coordinatorFor({ initial });
  const revoked = await coordinator.revoke({
    bindingId: "binding-a", operationId: "revoke-unsupported-01"
  });
  assert.equal(revoked.state, "REVOKE_UNSUPPORTED");
  assert.equal((await store.getBinding("binding-a")).activeVersionId, null);
  assert.equal(calls.some(call => call.method === "revokeApiKey"), false);
});

test("a stale fencing token cannot commit after a newer lease is acquired", async () => {
  const store = createStore(binding({ state: "ROTATION_REQUIRED", rotationRequired: true }));
  const stale = await store.acquireLease("binding-a", "rotate-stale-01", 30000);
  await store.releaseLease("binding-a", stale);
  await store.forceLeaseExpiry("binding-a");
  const current = await store.acquireLease("binding-a", "rotate-current-01", 30000);

  const savedWithStale = await store.compareAndSet(
    "binding-a",
    { generation: 1, state: "ROTATION_REQUIRED" },
    { ...binding({ state: "ACTIVE", generation: 2, activeVersionId: "version-2" }) },
    stale
  );
  assert.equal(savedWithStale, false);

  const savedWithCurrent = await store.compareAndSet(
    "binding-a",
    { generation: 1, state: "ROTATION_REQUIRED" },
    { ...binding({ state: "ACTIVE", generation: 2, activeVersionId: "version-2" }) },
    current
  );
  assert.equal(savedWithCurrent, true);
});

test("provider outcomes and operation records never expose plaintext secret fields", async () => {
  const { coordinator, store } = coordinatorFor({
    providerOverrides: {
      async rotateApiKey() {
        return { successorVersionId: "opaque-version-2", secretValue: "SYNTHETIC-SECRET-NOT-REAL" };
      }
    }
  });
  await coordinator.markSuccessfulUse({
    bindingId: "binding-a", operationId: "use-redaction-01", expectedGeneration: 1
  });
  const rotated = await coordinator.prepareNextUse({
    bindingId: "binding-a", operationId: "rotate-redaction-01"
  });
  assert.equal(rotated.secretValue, undefined);
  const operation = await store.getOperation("rotate-redaction-01");
  assert.equal(JSON.stringify(operation).includes("SYNTHETIC-SECRET-NOT-REAL"), false);
});
