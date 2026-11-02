import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const READ_ONLY = new Set([
  "account.summary.read", "balances.read", "positions.read",
  "orders.read", "quotes.read", "credential.status.read"
]);
const REQUEST_KEYS = new Set([
  "connection_id", "capability", "parameters", "policy_version", "client_correlation_id"
]);
const FORBIDDEN_KEYS = new Set([
  "owner_id", "tenant_id", "binding_id", "secret_id", "secret_value",
  "api_key", "api_secret", "access_token", "provider_url", "authorization",
  "private_key", "dek", "kek", "ciphertext", "wrapped_dek"
]);

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(key =>
      JSON.stringify(key) + ":" + canonical(value[key])
    ).join(",") + "}";
  }
  return JSON.stringify(value);
}

function containsForbidden(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    FORBIDDEN_KEYS.has(key.toLowerCase()) || containsForbidden(child)
  );
}

function isRfc3339DateTime(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|([+-])([01]\d|2[0-3]):([0-5]\d))$/i.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) return false;
  return Number.isFinite(Date.parse(value));
}

function safeResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || containsForbidden(value)) {
    throw new Error("UNSAFE_PROVIDER_RESULT");
  }
  const only = (object, keys) => object && typeof object === "object" &&
    !Array.isArray(object) && Object.keys(object).every(key => keys.has(key));
  if (!only(value, new Set(["account", "quotes", "positions", "rotation"]))) throw new Error("UNSAFE_PROVIDER_RESULT");
  if (value.account && (!only(value.account, new Set(["balance", "equity", "margin", "free_margin", "currency"])) ||
      Object.entries(value.account).some(([key, item]) =>
        key === "currency" ? typeof item !== "string" || item.length > 12 : typeof item !== "number" || !Number.isFinite(item)))) {
    throw new Error("UNSAFE_PROVIDER_RESULT");
  }
  if (value.quotes !== undefined) {
    if (!Array.isArray(value.quotes) || value.quotes.length > 500) {
      throw new Error("UNSAFE_PROVIDER_RESULT");
    }
    for (const item of value.quotes) {
      if (!only(item, new Set(["symbol", "bid", "ask", "timestamp"])) ||
          typeof item.symbol !== "string" || item.symbol.length < 1 || item.symbol.length > 32 ||
          typeof item.bid !== "number" || !Number.isFinite(item.bid) ||
          typeof item.ask !== "number" || !Number.isFinite(item.ask)) {
        throw new Error("UNSAFE_PROVIDER_RESULT");
      }
      if (item.timestamp !== undefined &&
          (typeof item.timestamp !== "string" || !isRfc3339DateTime(item.timestamp))) {
        throw new Error("UNSAFE_PROVIDER_RESULT");
      }
    }
  }
  if (value.positions !== undefined) {
    if (!Array.isArray(value.positions) || value.positions.length > 500) {
      throw new Error("UNSAFE_PROVIDER_RESULT");
    }
    for (const item of value.positions) {
      if (!only(item, new Set(["symbol", "side", "volume", "unrealized_pnl"])) ||
          typeof item.symbol !== "string" || item.symbol.length < 1 || item.symbol.length > 32 ||
          !["long", "short"].includes(item.side) ||
          typeof item.volume !== "number" || !Number.isFinite(item.volume)) {
        throw new Error("UNSAFE_PROVIDER_RESULT");
      }
      if (item.unrealized_pnl !== undefined &&
          (typeof item.unrealized_pnl !== "number" || !Number.isFinite(item.unrealized_pnl))) {
        throw new Error("UNSAFE_PROVIDER_RESULT");
      }
    }
  }
  if (value.rotation !== undefined) {
    if (!only(value.rotation, new Set(["state", "generation"])) ||
        (value.rotation.state !== undefined &&
          !["ROTATION_REQUIRED", "ROTATING", "ROTATED", "ROTATION_UNSUPPORTED", "REVOKED"].includes(value.rotation.state)) ||
        (value.rotation.generation !== undefined &&
          (!Number.isInteger(value.rotation.generation) || value.rotation.generation < 1))) {
      throw new Error("UNSAFE_PROVIDER_RESULT");
    }
  }
  return structuredClone(value);
}

function validParameters(parameters) {
  if (Object.keys(parameters).some(key => !["symbols", "since", "limit"].includes(key))) return false;
  if (parameters.symbols !== undefined &&
      (!Array.isArray(parameters.symbols) || parameters.symbols.length > 50 ||
       parameters.symbols.some(symbol => typeof symbol !== "string" || !/^[A-Z0-9._-]{1,32}$/.test(symbol)))) return false;
  if (parameters.since !== undefined &&
      (typeof parameters.since !== "string" || !isRfc3339DateTime(parameters.since))) return false;
  if (parameters.limit !== undefined &&
      (!Number.isInteger(parameters.limit) || parameters.limit < 1 || parameters.limit > 500)) return false;
  return true;
}

function response(status, body) {
  return {
    status,
    headers: { "cache-control": "no-store", pragma: "no-cache", "content-type": "application/json" },
    body
  };
}

/**
 * Local proof runtime. Identity verification, connection lookup, custody registry,
 * and provider execution are injected trust-boundary adapters. Production adapters
 * must independently verify Supabase JWTs and resolve ownership from trusted data.
 */
export function createCustodyRuntime({ verifySession, resolveConnection, resolveBinding, provider, ledgerDir }) {
  if (![verifySession, resolveConnection, resolveBinding, provider, ledgerDir].every(Boolean)) {
    throw new TypeError("Missing custody runtime dependency");
  }

  async function readLedger(path) {
    try { return JSON.parse(await readFile(path, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }

  async function claimOperation(key, record) {
    const path = join(ledgerDir, key + ".json");
    await mkdir(dirname(path), { recursive: true });
    const temporary = path + "." + randomUUID() + ".claim";
    try {
      await writeFile(temporary, JSON.stringify(record), { mode: 0o600, flag: "wx" });
      try {
        // Hard-link publication makes the complete claim visible atomically.
        await link(temporary, path);
        return { kind: "CLAIMED", record, path };
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const prior = await readLedger(path);
        if (!prior) throw new Error("LEDGER_RECORD_UNAVAILABLE");
        if (prior.fingerprint !== record.fingerprint) return { kind: "CONFLICT", record: prior, path };
        return { kind: "EXISTS", record: prior, path };
      }
    } finally {
      await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
  }

  async function persist(path, record) {
    const temporary = path + "." + randomUUID() + ".tmp";
    await writeFile(temporary, JSON.stringify(record), { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  }

  return {
    async handle({ authorization, idempotencyKey, body }) {
      if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
        return response(401, { state: "FAILED_FINAL", result_code: "INVALID_SESSION" });
      }

      let principal;
      try {
        principal = await verifySession(authorization.slice(7));
      } catch (error) {
        // A rejected/expired JWT is an authentication failure; an Auth/PostgREST
        // outage is transient infrastructure failure and must remain retryable.
        if (error?.message === "SUPABASE_UNAVAILABLE") {
          return response(503, { state: "FAILED_FINAL", result_code: "SUPABASE_UNAVAILABLE" });
        }
        return response(401, { state: "FAILED_FINAL", result_code: "INVALID_SESSION" });
      }
      if (!principal || typeof principal.subject !== "string" || !principal.subject) {
        return response(401, { state: "FAILED_FINAL", result_code: "INVALID_SESSION" });
      }

      if (!body || typeof body !== "object" || Array.isArray(body) ||
          Object.keys(body).some(key => !REQUEST_KEYS.has(key)) ||
          containsForbidden(body) ||
          typeof body.connection_id !== "string" ||
          !READ_ONLY.has(body.capability) ||
          !body.parameters || typeof body.parameters !== "object" || Array.isArray(body.parameters) ||
          !validParameters(body.parameters) ||
          typeof body.policy_version !== "string" || !/^[A-Za-z0-9._-]{1,40}$/.test(body.policy_version) ||
          typeof idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
        return response(400, { state: "FAILED_FINAL", result_code: "INVALID_REQUEST" });
      }

      let connection;
      let binding;
      try {
        connection = await resolveConnection(principal.subject, body.connection_id, principal);
        if (!connection || connection.ownerId !== principal.subject ||
            connection.connectionId !== body.connection_id) {
          return response(404, { state: "FAILED_FINAL", result_code: "NOT_FOUND" });
        }
        binding = await resolveBinding({ principalId: principal.subject, connection });
      } catch {
        return response(503, { state: "FAILED_FINAL", result_code: "CUSTODY_UNAVAILABLE" });
      }
      if (!binding || binding.principalId !== principal.subject ||
          binding.connectionId !== body.connection_id ||
          binding.provider !== connection.provider ||
          binding.environment !== connection.environment ||
          binding.state !== "ACTIVE" ||
          !Array.isArray(binding.capabilities) || !binding.capabilities.includes(body.capability)) {
        return response(404, { state: "FAILED_FINAL", result_code: "NOT_AUTHORIZED" });
      }

      const fingerprint = createHash("sha256").update(canonical({
        principal: principal.subject,
        binding: binding.bindingId,
        provider: binding.provider,
        environment: binding.environment,
        capability: body.capability,
        policyVersion: body.policy_version,
        parameters: body.parameters
      })).digest("hex");
      const ledgerKey = createHash("sha256").update([
        principal.subject, binding.bindingId, body.capability, idempotencyKey
      ].join("\u0000")).digest("hex");
      const initial = {
        operationId: randomUUID(), principalId: principal.subject,
        bindingId: binding.bindingId, connectionId: binding.connectionId,
        fingerprint, state: "RUNNING", createdAt: new Date().toISOString()
      };

      let claim;
      try { claim = await claimOperation(ledgerKey, initial); }
      catch { return response(503, { state: "FAILED_FINAL", result_code: "LEDGER_UNAVAILABLE" }); }
      if (claim.kind === "CONFLICT") {
        return response(409, { operation_id: claim.record.operationId, state: claim.record.state, result_code: "IDEMPOTENCY_CONFLICT" });
      }
      if (claim.kind === "EXISTS") {
        const prior = claim.record;
        if (prior.state === "SUCCEEDED") {
          return response(200, { operation_id: prior.operationId, state: prior.state, result: prior.result });
        }
        if (prior.state === "OUTCOME_UNKNOWN" || prior.state === "RUNNING") {
          return response(202, { operation_id: prior.operationId, state: prior.state, reconciliation_required: true });
        }
        return response(200, { operation_id: prior.operationId, state: prior.state, result_code: prior.resultCode });
      }

      try {
        // The adapter receives only server-resolved binding metadata and bounded intent.
        // It owns secret retrieval/decryption; no credential bytes cross this boundary.
        const providerResult = await provider.executeReadOnly({
          binding: structuredClone(binding),
          capability: body.capability,
          parameters: structuredClone(body.parameters),
          operationId: initial.operationId
        });
        const result = safeResult(providerResult);
        const completed = { ...initial, state: "SUCCEEDED", result, updatedAt: new Date().toISOString() };
        await persist(claim.path, completed);
        return response(200, { operation_id: completed.operationId, state: completed.state, result });
      } catch (error) {
        const unknown = error?.outcomeUnknown === true;
        const failed = {
          ...initial,
          state: unknown ? "OUTCOME_UNKNOWN" : "FAILED_FINAL",
          resultCode: unknown ? "PROVIDER_OUTCOME_UNKNOWN" : "PROVIDER_OPERATION_FAILED",
          updatedAt: new Date().toISOString()
        };
        await persist(claim.path, failed);
        return response(unknown ? 202 : 502, {
          operation_id: failed.operationId, state: failed.state,
          result_code: failed.resultCode, reconciliation_required: unknown
        });
      }
    }
  };
}
