import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "supabase", "recovered-history", "manifest.json");
const activeDir = path.join(root, "supabase", "migrations");
const archiveDir = path.join(root, "supabase", "recovered-history", "production");
const pendingPath = path.join(root, "supabase", "pending-migrations", "nova_video_workspace.sql");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const entries = manifest?.environments?.production?.migrations;

assert.equal(manifest?.schema_version, 1, "unsupported archive manifest schema");
assert.equal(manifest?.hash_algorithm, "SHA-256 over exact UTF-8 SQL payload (no added newline)");
assert.ok(Array.isArray(entries), "production migration inventory missing");
assert.equal(entries.length, 28, "expected exactly 28 recovered Production migrations");
assert.equal(manifest.environments.production.migration_count, 28, "manifest migration_count must equal 28");
assert.equal(manifest.environments.production.first_version, entries[0]?.version, "first migration version mismatch");
assert.equal(manifest.environments.production.latest_version, entries.at(-1)?.version, "latest migration version mismatch");

const expectedNames = [];
const seenVersions = new Set();
let verifiedBytes = 0;
let archivedVerifiedBytes = 0;
for (const entry of entries) {
  assert.match(entry.version, /^[0-9]{14}$/, `invalid migration version: ${entry.version}`);
  assert.match(entry.name, /^[a-z0-9_]+$/, `invalid migration name: ${entry.name}`);
  assert.ok(!seenVersions.has(entry.version), `duplicate migration version: ${entry.version}`);
  seenVersions.add(entry.version);

  const expectedPath = `supabase/migrations/${entry.version}_${entry.name}.sql`;
  assert.equal(entry.path, `supabase/recovered-history/production/${entry.version}_${entry.name}.sql`);
  const filePath = path.join(root, expectedPath);
  assert.ok(existsSync(filePath), `active migration missing: ${expectedPath}`);
  const bytes = readFileSync(filePath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.equal(digest, entry.sha256, `SHA-256 mismatch: ${expectedPath}`);
  assert.equal(bytes.toString("utf8").length, entry.sql_chars, `SQL character count mismatch: ${expectedPath}`);
  verifiedBytes += bytes.length;

  const archivePath = path.join(root, entry.path);
  assert.ok(existsSync(archivePath), `forensic archive payload missing: ${entry.path}`);
  const archiveBytes = readFileSync(archivePath);
  const archiveDigest = createHash("sha256").update(archiveBytes).digest("hex");
  assert.equal(archiveDigest, entry.sha256, `archive SHA-256 mismatch: ${entry.path}`);
  assert.equal(archiveBytes.toString("utf8").length, entry.sql_chars, `archive SQL character count mismatch: ${entry.path}`);
  archivedVerifiedBytes += archiveBytes.length;
  expectedNames.push(path.basename(expectedPath));
}

const activeNames = readdirSync(activeDir).filter((name) => name.endsWith(".sql")).sort();
assert.deepEqual(activeNames, [...expectedNames].sort(), "active migration directory must exactly match the 28 Production ledger entries");
const archiveNames = readdirSync(archiveDir).filter((name) => name.endsWith(".sql")).sort();
assert.deepEqual(archiveNames, [...expectedNames].sort(), "forensic archive directory must exactly match the 28 Production ledger entries");
assert.ok(existsSync(pendingPath), "unapplied Video Workspace SQL must remain preserved outside the active migration directory");
assert.ok(!activeNames.some((name) => name.includes("nova_video_workspace")), "unapplied Video Workspace migration must not be active yet");

console.log(JSON.stringify({
  status: "production_migration_archive_integrity_passed",
  migration_count: entries.length,
  active_file_count: activeNames.length,
  archive_file_count: archiveNames.length,
  archived_verified_bytes: archivedVerifiedBytes,
  verified_bytes: verifiedBytes,
  first_version: entries[0].version,
  latest_version: entries.at(-1).version,
  pending_video_workspace_preserved: true,
}, null, 2));
