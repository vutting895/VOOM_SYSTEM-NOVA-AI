const ROTATION_METHOD = Object.freeze({
  API_KEY_ROTATION: "rotateApiKey",
  OAUTH_REFRESH: "refreshOAuthToken"
});
const REVOKE_METHOD = Object.freeze({
  API_KEY_ROTATION: "revokeApiKey",
  OAUTH_REFRESH: "revokeOAuthGrant"
});
const OPERATION_ID = /^[A-Za-z0-9._:-]{8,128}$/;

function safeBinding(binding) {
  return {
    bindingId: binding.bindingId,
    ownerId: binding.ownerId,
    provider: binding.provider,
    environment: binding.environment,
    credentialType: binding.credentialType,
    generation: binding.generation,
    activeVersionId: binding.activeVersionId
  };
}

function result(status, state, resultCode, extra = {}) {
  return { status, state, result_code: resultCode, ...extra };
}

function validBinding(binding) {
  return Boolean(binding &&
    typeof binding.bindingId === "string" && binding.bindingId &&
    typeof binding.ownerId === "string" && binding.ownerId &&
    typeof binding.provider === "string" && binding.provider &&
    typeof binding.environment === "string" && binding.environment &&
    typeof binding.credentialType === "string" && binding.credentialType &&
    Number.isSafeInteger(binding.generation) && binding.generation >= 1 &&
    typeof binding.activeVersionId === "string" && binding.activeVersionId);
}

function validStrategy(strategy) {
  return Boolean(strategy &&
    (strategy.rotationKind === "API_KEY_ROTATION" || strategy.rotationKind === "OAUTH_REFRESH"));
}

function operationFingerprint(action, bindingId, discriminator = "") {
  return [action, bindingId, discriminator].join("\u0000");
}

function replayResult(prior, fingerprint) {
  if (!prior) return null;
  if (prior.fingerprint !== fingerprint) return result(409, "FAILED_FINAL", "IDEMPOTENCY_CONFLICT");
  if (prior.status === "COMPLETED") return { ...prior.result, replayed: true };
  return result(202, "RUNNING", "OPERATION_IN_PROGRESS", { reconciliation_required: true });
}

/**
 * Local lifecycle proof only. The store must provide atomic durable operations in
 * production; tests use an in-memory implementation. Provider adapters keep
 * credential bytes inside the custody boundary and return opaque version IDs.
 */
export function createRotationCoordinator({ store, registry, provider, leaseMs = 30_000 } = {}) {
  const requiredStoreMethods = [
    "getBinding", "getOperation", "reserveOperation", "completeOperation",
    "abandonOperation", "acquireLease", "releaseLease", "compareAndSet"
  ];
  if (!store || requiredStoreMethods.some(name => typeof store[name] !== "function") ||
      !registry || typeof registry.resolve !== "function" ||
      !provider || !Number.isSafeInteger(leaseMs) || leaseMs < 1000) {
    throw new TypeError("INVALID_ROTATION_COORDINATOR_DEPENDENCIES");
  }

  async function reserve(operationId, fingerprint) {
    const prior = await store.getOperation(operationId);
    const replay = replayResult(prior, fingerprint);
    if (replay) return { kind: "RETURN", result: replay };
    const claim = await store.reserveOperation({ operationId, fingerprint });
    if (claim?.kind === "CONFLICT") {
      return { kind: "RETURN", result: result(409, "FAILED_FINAL", "IDEMPOTENCY_CONFLICT") };
    }
    if (claim?.kind === "IN_PROGRESS") {
      return { kind: "RETURN", result: result(202, "RUNNING", "OPERATION_IN_PROGRESS", { reconciliation_required: true }) };
    }
    if (claim?.kind !== "CLAIMED") {
      return { kind: "RETURN", result: result(503, "FAILED_FINAL", "LEDGER_UNAVAILABLE") };
    }
    return { kind: "CLAIMED" };
  }

  async function finish(operationId, response) {
    await store.completeOperation(operationId, response);
    return response;
  }

  async function blockVersion(binding, nextState, resultCode, operationId, lease) {
    const next = {
      ...binding,
      state: nextState,
      rotationRequired: true,
      blockedVersionId: binding.activeVersionId || binding.blockedVersionId || null,
      activeVersionId: null,
      pendingOperationId: operationId || null
    };
    const saved = await store.compareAndSet(
      binding.bindingId,
      { generation: binding.generation, state: binding.state },
      next,
      lease
    );
    return saved ? result(409, nextState, resultCode, { generation: binding.generation }) :
      result(503, "RECONCILIATION_REQUIRED", "FENCED_STATE_CHANGE", { reconciliation_required: true });
  }

  async function markSuccessfulUse({ bindingId, operationId, expectedGeneration }) {
    if (typeof bindingId !== "string" || !bindingId || !OPERATION_ID.test(String(operationId || "")) ||
        !Number.isSafeInteger(expectedGeneration) || expectedGeneration < 1) {
      return result(400, "FAILED_FINAL", "INVALID_REQUEST");
    }

    const fingerprint = operationFingerprint("successful-use", bindingId, String(expectedGeneration));
    const prior = replayResult(await store.getOperation(operationId), fingerprint);
    if (prior) return prior;

    const binding = await store.getBinding(bindingId);
    if (!validBinding(binding)) return result(404, "FAILED_FINAL", "BINDING_NOT_FOUND");
    if (binding.state !== "ACTIVE" || binding.generation !== expectedGeneration ||
        binding.rotationRequired === true) {
      return result(409, "FAILED_FINAL", "BINDING_STATE_CONFLICT", { generation: binding.generation });
    }

    const claim = await reserve(operationId, fingerprint);
    if (claim.kind === "RETURN") return claim.result;

    const next = {
      ...binding,
      state: "ROTATION_REQUIRED",
      rotationRequired: true,
      lastSuccessfulUseOperationId: operationId
    };
    const saved = await store.compareAndSet(
      bindingId,
      { generation: binding.generation, state: "ACTIVE" },
      next,
      null
    );
    if (!saved) {
      await store.abandonOperation(operationId);
      return result(409, "FAILED_FINAL", "BINDING_STATE_CONFLICT");
    }
    return finish(operationId, result(200, "ROTATION_REQUIRED", "ROTATION_REQUIRED", {
      generation: binding.generation
    }));
  }

  async function prepareNextUse({ bindingId, operationId }) {
    if (typeof bindingId !== "string" || !bindingId || !OPERATION_ID.test(String(operationId || ""))) {
      return result(400, "FAILED_FINAL", "INVALID_REQUEST");
    }

    const fingerprint = operationFingerprint("rotate-before-next-use", bindingId);
    const prior = replayResult(await store.getOperation(operationId), fingerprint);
    if (prior) return prior;

    const binding = await store.getBinding(bindingId);
    if (!binding) return result(404, "FAILED_FINAL", "BINDING_NOT_FOUND");
    if (binding.state === "ACTIVE" && binding.rotationRequired !== true && validBinding(binding)) {
      return result(200, "READY", "CURRENT_VERSION_READY", {
        generation: binding.generation,
        activeVersionId: binding.activeVersionId
      });
    }
    if (binding.state !== "ROTATION_REQUIRED" ||
        !validBinding({ ...binding, activeVersionId: binding.activeVersionId || binding.blockedVersionId })) {
      const blocked = binding.state || "UNKNOWN";
      return result(409, blocked, blocked, { reconciliation_required: blocked.includes("UNKNOWN") });
    }

    const claim = await reserve(operationId, fingerprint);
    if (claim.kind === "RETURN") return claim.result;

    const lease = await store.acquireLease(bindingId, operationId, leaseMs);
    if (!lease) {
      await store.abandonOperation(operationId);
      return result(202, "RUNNING", "ROTATION_LEASE_BUSY", { retry_after_ms: 1000 });
    }

    try {
      const current = await store.getBinding(bindingId);
      if (!validBinding(current) || current.state !== "ROTATION_REQUIRED" ||
          current.generation !== binding.generation || current.activeVersionId !== binding.activeVersionId) {
        await store.abandonOperation(operationId);
        return result(409, "FAILED_FINAL", "BINDING_STATE_CONFLICT");
      }

      const strategy = await registry.resolve({
        provider: current.provider,
        environment: current.environment,
        credentialType: current.credentialType
      });
      if (!validStrategy(strategy)) {
        const blocked = await blockVersion(current, "ROTATION_UNSUPPORTED", "ROTATION_UNSUPPORTED", operationId, lease);
        return finish(operationId, blocked);
      }

      const rotateMethod = provider[ROTATION_METHOD[strategy.rotationKind]];
      if (typeof rotateMethod !== "function" || typeof provider.validateSuccessor !== "function") {
        const blocked = await blockVersion(current, "ROTATION_UNSUPPORTED", "ROTATION_UNSUPPORTED", operationId, lease);
        return finish(operationId, blocked);
      }

      let rotated;
      try {
        rotated = await rotateMethod.call(provider, {
          binding: safeBinding(current),
          currentVersionId: current.activeVersionId,
          operationId,
          rotationKind: strategy.rotationKind
        });
      } catch (error) {
        const unknown = error?.outcomeUnknown === true;
        const blocked = await blockVersion(
          current,
          unknown ? "ROTATION_UNKNOWN" : "ROTATION_FAILED",
          unknown ? "PROVIDER_OUTCOME_UNKNOWN" : "PROVIDER_ROTATION_FAILED",
          operationId,
          lease
        );
        return finish(operationId, {
          ...blocked,
          reconciliation_required: unknown || blocked.state === "RECONCILIATION_REQUIRED"
        });
      }

      const successorVersionId = rotated?.successorVersionId;
      if (typeof successorVersionId !== "string" || !successorVersionId ||
          successorVersionId === current.activeVersionId) {
        const blocked = await blockVersion(current, "ROTATION_FAILED", "INVALID_SUCCESSOR", operationId, lease);
        return finish(operationId, blocked);
      }

      let valid = false;
      try {
        valid = await provider.validateSuccessor({
          binding: safeBinding(current),
          successorVersionId,
          rotationKind: strategy.rotationKind
        }) === true;
      } catch {
        valid = false;
      }
      if (!valid) {
        const blocked = await blockVersion(current, "ROTATION_FAILED", "SUCCESSOR_VALIDATION_FAILED", operationId, lease);
        return finish(operationId, blocked);
      }

      const next = {
        ...current,
        state: "ACTIVE",
        generation: current.generation + 1,
        activeVersionId: successorVersionId,
        previousVersionId: current.activeVersionId,
        previousVersionState: "RETIRED",
        blockedVersionId: null,
        rotationRequired: false,
        pendingOperationId: null,
        lastRotationOperationId: operationId
      };
      const saved = await store.compareAndSet(
        bindingId,
        { generation: current.generation, state: "ROTATION_REQUIRED" },
        next,
        lease
      );
      if (!saved) {
        return finish(operationId, result(503, "RECONCILIATION_REQUIRED", "FENCED_STATE_CHANGE", {
          reconciliation_required: true
        }));
      }
      return finish(operationId, result(200, "ROTATED", "SUCCESSOR_ACTIVE", {
        generation: next.generation,
        activeVersionId: successorVersionId,
        previousVersionState: "RETIRED"
      }));
    } finally {
      await store.releaseLease(bindingId, lease).catch(() => {});
    }
  }

  async function reconcileRotation({ bindingId, operationId, originalOperationId }) {
    if (typeof bindingId !== "string" || !bindingId ||
        !OPERATION_ID.test(String(operationId || "")) ||
        !OPERATION_ID.test(String(originalOperationId || ""))) {
      return result(400, "FAILED_FINAL", "INVALID_REQUEST");
    }

    const fingerprint = operationFingerprint("reconcile-rotation", bindingId, originalOperationId);
    const prior = replayResult(await store.getOperation(operationId), fingerprint);
    if (prior) return prior;

    const binding = await store.getBinding(bindingId);
    if (!binding || binding.state !== "ROTATION_UNKNOWN" ||
        binding.pendingOperationId !== originalOperationId) {
      return result(409, "FAILED_FINAL", "NO_MATCHING_UNKNOWN_ROTATION");
    }
    const claim = await reserve(operationId, fingerprint);
    if (claim.kind === "RETURN") return claim.result;

    const lease = await store.acquireLease(bindingId, operationId, leaseMs);
    if (!lease) {
      await store.abandonOperation(operationId);
      return result(202, "RUNNING", "RECONCILIATION_LEASE_BUSY", { retry_after_ms: 1000 });
    }

    try {
      const current = await store.getBinding(bindingId);
      if (!current || current.state !== "ROTATION_UNKNOWN" ||
          current.pendingOperationId !== originalOperationId) {
        await store.abandonOperation(operationId);
        return result(409, "FAILED_FINAL", "BINDING_STATE_CONFLICT");
      }
      const strategy = await registry.resolve({
        provider: current.provider,
        environment: current.environment,
        credentialType: current.credentialType
      });
      if (!validStrategy(strategy) || typeof provider.reconcileRotation !== "function") {
        return finish(operationId, result(202, "ROTATION_UNKNOWN", "MANUAL_RECONCILIATION_REQUIRED", {
          reconciliation_required: true
        }));
      }

      let outcome;
      try {
        outcome = await provider.reconcileRotation({
          binding: safeBinding(current),
          originalOperationId,
          rotationKind: strategy.rotationKind
        });
      } catch {
        outcome = { status: "UNKNOWN" };
      }

      if (outcome?.status === "SUCCEEDED" &&
          typeof outcome.successorVersionId === "string" && outcome.successorVersionId &&
          outcome.successorVersionId !== current.blockedVersionId) {
        let valid = false;
        try {
          valid = await provider.validateSuccessor({
            binding: safeBinding(current),
            successorVersionId: outcome.successorVersionId,
            rotationKind: strategy.rotationKind
          }) === true;
        } catch {
          valid = false;
        }
        if (valid) {
          const next = {
            ...current,
            state: "ACTIVE",
            generation: current.generation + 1,
            activeVersionId: outcome.successorVersionId,
            previousVersionId: current.blockedVersionId,
            previousVersionState: "RETIRED",
            blockedVersionId: null,
            rotationRequired: false,
            pendingOperationId: null,
            lastRotationOperationId: originalOperationId
          };
          const saved = await store.compareAndSet(
            bindingId,
            { generation: current.generation, state: "ROTATION_UNKNOWN" },
            next,
            lease
          );
          if (!saved) {
            return finish(operationId, result(503, "RECONCILIATION_REQUIRED", "FENCED_STATE_CHANGE", {
              reconciliation_required: true
            }));
          }
          return finish(operationId, result(200, "ROTATED", "RECONCILED_SUCCESSOR_ACTIVE", {
            generation: next.generation,
            activeVersionId: next.activeVersionId
          }));
        }
      }

      if (outcome?.status === "NOT_APPLIED") {
        const next = {
          ...current,
          state: "ROTATION_FAILED",
          activeVersionId: null,
          rotationRequired: true,
          pendingOperationId: null
        };
        const saved = await store.compareAndSet(
          bindingId,
          { generation: current.generation, state: "ROTATION_UNKNOWN" },
          next,
          lease
        );
        const failed = saved
          ? result(409, "ROTATION_FAILED", "ROTATION_NOT_APPLIED_NEW_CREDENTIAL_REQUIRED")
          : result(503, "RECONCILIATION_REQUIRED", "FENCED_STATE_CHANGE", { reconciliation_required: true });
        return finish(operationId, failed);
      }

      return finish(operationId, result(202, "ROTATION_UNKNOWN", "PROVIDER_OUTCOME_STILL_UNKNOWN", {
        reconciliation_required: true
      }));
    } finally {
      await store.releaseLease(bindingId, lease).catch(() => {});
    }
  }

  async function revoke({ bindingId, operationId }) {
    if (typeof bindingId !== "string" || !bindingId || !OPERATION_ID.test(String(operationId || ""))) {
      return result(400, "FAILED_FINAL", "INVALID_REQUEST");
    }

    const fingerprint = operationFingerprint("revoke", bindingId);
    const prior = replayResult(await store.getOperation(operationId), fingerprint);
    if (prior) return prior;

    const binding = await store.getBinding(bindingId);
    if (!binding) return result(404, "FAILED_FINAL", "BINDING_NOT_FOUND");
    if (binding.state === "REVOKED") return result(200, "REVOKED", "ALREADY_REVOKED");
    if (!validBinding(binding) || !["ACTIVE", "ROTATION_REQUIRED"].includes(binding.state)) {
      return result(409, binding.state || "UNKNOWN", "BINDING_NOT_REVOCABLE", {
        reconciliation_required: String(binding.state).includes("UNKNOWN")
      });
    }

    const claim = await reserve(operationId, fingerprint);
    if (claim.kind === "RETURN") return claim.result;
    const lease = await store.acquireLease(bindingId, operationId, leaseMs);
    if (!lease) {
      await store.abandonOperation(operationId);
      return result(202, "RUNNING", "REVOKE_LEASE_BUSY", { retry_after_ms: 1000 });
    }

    try {
      const current = await store.getBinding(bindingId);
      if (!validBinding(current) || !["ACTIVE", "ROTATION_REQUIRED"].includes(current.state) ||
          current.generation !== binding.generation) {
        await store.abandonOperation(operationId);
        return result(409, "FAILED_FINAL", "BINDING_STATE_CONFLICT");
      }
      const strategy = await registry.resolve({
        provider: current.provider,
        environment: current.environment,
        credentialType: current.credentialType
      });
      const revokeMethod = validStrategy(strategy) ? provider[REVOKE_METHOD[strategy.rotationKind]] : null;
      if (strategy?.supportsRevoke !== true || typeof revokeMethod !== "function") {
        const blocked = await blockVersion(current, "REVOKE_UNSUPPORTED", "REVOKE_UNSUPPORTED", operationId, lease);
        return finish(operationId, blocked);
      }

      try {
        await revokeMethod.call(provider, {
          binding: safeBinding(current),
          versionId: current.activeVersionId,
          operationId,
          rotationKind: strategy.rotationKind
        });
      } catch (error) {
        const unknown = error?.outcomeUnknown === true;
        const blocked = await blockVersion(
          current,
          unknown ? "REVOKE_UNKNOWN" : "REVOKE_FAILED",
          unknown ? "PROVIDER_REVOKE_OUTCOME_UNKNOWN" : "PROVIDER_REVOKE_FAILED",
          operationId,
          lease
        );
        return finish(operationId, {
          ...blocked,
          reconciliation_required: unknown || blocked.state === "RECONCILIATION_REQUIRED"
        });
      }

      const next = {
        ...current,
        state: "REVOKED",
        activeVersionId: null,
        blockedVersionId: current.activeVersionId,
        rotationRequired: false,
        pendingOperationId: null,
        revokedOperationId: operationId
      };
      const saved = await store.compareAndSet(
        bindingId,
        { generation: current.generation, state: current.state },
        next,
        lease
      );
      if (!saved) {
        return finish(operationId, result(503, "RECONCILIATION_REQUIRED", "FENCED_STATE_CHANGE", {
          reconciliation_required: true
        }));
      }
      return finish(operationId, result(200, "REVOKED", "PROVIDER_CREDENTIAL_REVOKED", {
        generation: next.generation
      }));
    } finally {
      await store.releaseLease(bindingId, lease).catch(() => {});
    }
  }

  return { markSuccessfulUse, prepareNextUse, reconcileRotation, revoke };
}
