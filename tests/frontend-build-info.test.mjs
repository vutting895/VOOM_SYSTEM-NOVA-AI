import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = resolve(fileURLToPath(new URL("../frontend/scripts/write-build-info.mjs", import.meta.url)));

async function runWriter(envOverrides) {
  const cwd = await mkdtemp(join(tmpdir(), "nova-build-info-"));
  try {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, COMMIT_REF: "", GITHUB_SHA: "", SOURCE_VERSION: "", ...envOverrides }
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const file = await readFile(join(cwd, "public", "build-info.json"), "utf8");
    return JSON.parse(file);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test("build metadata records the Netlify commit SHA when available", async () => {
  const commit = "a".repeat(40);
  assert.deepEqual(await runWriter({ COMMIT_REF: commit, GITHUB_SHA: "b".repeat(40) }), { commit });
});

test("build metadata falls back to the CI SHA and fails closed for unknown build IDs", async () => {
  const ciCommit = "c".repeat(40);
  assert.deepEqual(await runWriter({ COMMIT_REF: "not-a-sha", GITHUB_SHA: ciCommit }), { commit: ciCommit });
  assert.deepEqual(await runWriter({ COMMIT_REF: "", GITHUB_SHA: "", SOURCE_VERSION: "not-a-sha" }), { commit: "unknown" });
});
