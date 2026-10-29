import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const candidate = process.env.COMMIT_REF || process.env.GITHUB_SHA || process.env.SOURCE_VERSION || "";
const commit = /^[0-9a-f]{40}$/i.test(candidate) ? candidate.toLowerCase() : "unknown";
const outputPath = resolve(process.cwd(), "public", "build-info.json");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify({ commit }) + "\n", {
  encoding: "utf8",
  mode: 0o644
});

console.log(`NOVA frontend build metadata generated (commit=${commit})`);
