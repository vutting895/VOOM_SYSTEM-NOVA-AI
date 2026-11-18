/**
 * NOVA R2 storage adapter for Cloudflare Workers.
 *
 * Uses a private R2 binding; no public bucket, S3 credentials, or client-side
 * access is required. This module deliberately has no delete method.
 */
const ALLOWED_ROOTS = new Set([
  "raw", "processed", "features", "datasets", "quarantine",
  "checkpoints", "models", "manifests", "quality-reports"
]);

export function validateObjectKey(key) {
  if (typeof key !== "string" || key.length < 3 || key.length > 1024) {
    throw new TypeError("Invalid R2 object key length");
  }
  if (key.startsWith("/") || key.includes("\\") || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new TypeError("Invalid R2 object key characters");
  }
  const parts = key.split("/");
  if (!ALLOWED_ROOTS.has(parts[0]) || parts.some(part => !part || part === "." || part === "..")) {
    throw new TypeError("R2 object key is outside the NOVA allowed prefixes");
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(key)) {
    throw new TypeError("R2 object key contains unsupported characters");
  }
  return key;
}

async function toBytes(body) {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  throw new TypeError("Body must be a string, Blob, ArrayBuffer, or typed array");
}

export async function sha256Hex(body) {
  const bytes = await toBytes(body);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export async function putImmutableObject({ bucket, key, body, contentType = "application/octet-stream", metadata = {}, maxBytes = 100 * 1024 * 1024 }) {
  if (!bucket || typeof bucket.put !== "function") throw new TypeError("R2 bucket binding is required");
  validateObjectKey(key);
  const bytes = await toBytes(body);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || bytes.byteLength > maxBytes) {\n    throw new RangeError(`Object exceeds the configured upload limit of ${maxBytes} bytes`);\n  }\n  const sha256 = await sha256Hex(bytes);
  const result = await bucket.put(key, bytes, {
    httpMetadata: { contentType },
    customMetadata: { ...metadata, sha256, immutable: "true" },
    onlyIf: { etagDoesNotMatch: "*" }
  });
  if (!result) {
    const error = new Error("Object already exists; immutable write refused");
    error.code = "NOVA_R2_OBJECT_EXISTS";
    throw error;
  }
  if (result.size !== bytes.byteLength) {
    throw new Error("R2 object size verification failed after upload");
  }
  if (result.customMetadata?.sha256 !== sha256) {
    throw new Error("R2 object checksum metadata verification failed after upload");
  }
  return { key, sha256, byteSize: bytes.byteLength, etag: result.etag, uploadedAt: result.uploaded?.toISOString?.() ?? null };
}

export async function getVerifiedObject({ bucket, key }) {
  if (!bucket || typeof bucket.get !== "function") throw new TypeError("R2 bucket binding is required");
  validateObjectKey(key);
  const object = await bucket.get(key);
  if (!object) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  const actual = await sha256Hex(bytes);
  const expected = object.customMetadata?.sha256;
  if (!expected || actual !== expected) {
    const error = new Error("R2 object SHA-256 verification failed");
    error.code = "NOVA_R2_CHECKSUM_MISMATCH";
    throw error;
  }
  return { key, sha256: actual, byteSize: bytes.byteLength, contentType: object.httpMetadata?.contentType ?? "application/octet-stream", bytes };
}

export async function headObject({ bucket, key }) {
  if (!bucket || typeof bucket.head !== "function") throw new TypeError("R2 bucket binding is required");
  validateObjectKey(key);
  const object = await bucket.head(key);
  if (!object) return null;
  return { key, sha256: object.customMetadata?.sha256 ?? null, byteSize: object.size, etag: object.etag, uploadedAt: object.uploaded?.toISOString?.() ?? null };
}

export async function listObjects({ bucket, prefix, cursor, limit = 100 }) {
  if (!bucket || typeof bucket.list !== "function") throw new TypeError("R2 bucket binding is required");
  validateObjectKey(prefix.endsWith("/") ? prefix.slice(0, -1) + "/index" : prefix);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("limit must be 1..1000");
  const result = await bucket.list({ prefix, cursor, limit });
  return {
    objects: (result.objects ?? []).map(object => ({
      key: object.key,
      sha256: object.customMetadata?.sha256 ?? null,
      byteSize: object.size,
      etag: object.etag
    })),
    cursor: result.truncated ? result.cursor : null,
    truncated: Boolean(result.truncated)
  };
}
