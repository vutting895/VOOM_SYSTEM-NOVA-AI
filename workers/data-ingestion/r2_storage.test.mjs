import test from "node:test";
import assert from "node:assert/strict";
import { getVerifiedObject, headObject, listObjects, putImmutableObject, validateObjectKey } from "./r2_storage.mjs";

class MemoryBucket {
  objects = new Map();
  async put(key, body, options = {}) {
    if (options.onlyIf?.etagDoesNotMatch === "*" && this.objects.has(key)) return null;
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
    const value = { bytes, size: bytes.byteLength, etag: "test-etag", uploaded: new Date(), customMetadata: options.customMetadata, httpMetadata: options.httpMetadata };
    this.objects.set(key, value);
    return value;
  }
  async get(key) {
    const value = this.objects.get(key);
    if (!value) return null;
    return { ...value, arrayBuffer: async () => value.bytes.slice().buffer };
  }
  async head(key) { return this.objects.get(key) ?? null; }
  async list({ prefix, limit }) {
    const objects = [...this.objects.entries()].filter(([key]) => key.startsWith(prefix)).slice(0, limit).map(([key, value]) => ({ key, ...value }));
    return { objects, truncated: false, cursor: undefined };
  }
}

test("rejects keys outside approved roots and path traversal", () => {
  assert.throws(() => validateObjectKey("../secrets.txt"), /allowed prefixes|Invalid/);
  assert.throws(() => validateObjectKey("raw/../secret.csv"), /allowed prefixes/);
  assert.throws(() => validateObjectKey("public/data.csv"), /allowed prefixes/);
  assert.equal(validateObjectKey("raw/exness/XAUUSDm/H1/2026-01.parquet"), "raw/exness/XAUUSDm/H1/2026-01.parquet");
});

test("stores immutable objects with a SHA-256 manifest value", async () => {
  const bucket = new MemoryBucket();
  const result = await putImmutableObject({ bucket, key: "raw/exness/XAUUSDm/H1/sample.jsonl", body: "nova-data" });
  assert.equal(result.byteSize, 9);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  const stored = await getVerifiedObject({ bucket, key: result.key });
  assert.equal(new TextDecoder().decode(stored.bytes), "nova-data");
  assert.equal((await headObject({ bucket, key: result.key })).sha256, result.sha256);
});

test("refuses overwrite of an existing object key", async () => {
  const bucket = new MemoryBucket();
  const args = { bucket, key: "datasets/ds_testdata01/data.jsonl", body: "first" };
  await putImmutableObject(args);
  await assert.rejects(() => putImmutableObject({ ...args, body: "second" }), { code: "NOVA_R2_OBJECT_EXISTS" });
});

test("detects object content changed after upload", async () => {
  const bucket = new MemoryBucket();
  await putImmutableObject({ bucket, key: "processed/XAUUSD/H1/sample.jsonl", body: "original" });
  bucket.objects.get("processed/XAUUSD/H1/sample.jsonl").bytes = new TextEncoder().encode("tampered");
  await assert.rejects(() => getVerifiedObject({ bucket, key: "processed/XAUUSD/H1/sample.jsonl" }), { code: "NOVA_R2_CHECKSUM_MISMATCH" });
});

test("lists only the requested prefix", async () => {
  const bucket = new MemoryBucket();
  await putImmutableObject({ bucket, key: "raw/exness/a.jsonl", body: "a" });
  await putImmutableObject({ bucket, key: "models/xgb/model.bin", body: "b" });
  const result = await listObjects({ bucket, prefix: "raw/", limit: 10 });
  assert.equal(result.objects.length, 1);
  assert.equal(result.objects[0].key, "raw/exness/a.jsonl");
});

test("enforces a bounded single-object upload size", async () => {
  const bucket = new MemoryBucket();
  await assert.rejects(
    () => putImmutableObject({ bucket, key: "raw/exness/large.bin", body: "12345", maxBytes: 4 }),
    RangeError
  );
  assert.equal(bucket.objects.size, 0);
});
