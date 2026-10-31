import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const [expectedPath, actualPath] = process.argv.slice(2);
if (!expectedPath || !actualPath) {
  throw new Error("Usage: node tests/supabase-catalog-fingerprint-compare.mjs <expected.json> <actual.json>");
}
const expected = JSON.parse(readFileSync(expectedPath, "utf8"));
const actual = JSON.parse(readFileSync(actualPath, "utf8"));
if (!isDeepStrictEqual(actual, expected)) {
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])];
  const differences = keys.filter((key) => !isDeepStrictEqual(actual[key], expected[key]));
  const summary = Object.fromEntries(keys.map((key) => [
    key,
    {
      expected: Array.isArray(expected[key]) ? expected[key].length : expected[key] == null ? null : "object",
      actual: Array.isArray(actual[key]) ? actual[key].length : actual[key] == null ? null : "object",
      differs: differences.includes(key),
    },
  ]));
  process.stderr.write("Production schema fingerprint mismatch by catalog category:\n");
  process.stderr.write(JSON.stringify(summary, null, 2) + "\n");
  for (const key of differences) {
    if (!Array.isArray(expected[key]) || !Array.isArray(actual[key])) continue;
    const expectedSet = new Set(expected[key].map((item) => JSON.stringify(item)));
    const actualSet = new Set(actual[key].map((item) => JSON.stringify(item)));
    const missing = expected[key].filter((item) => !actualSet.has(JSON.stringify(item)));
    const extra = actual[key].filter((item) => !expectedSet.has(JSON.stringify(item)));
    if (missing.length || extra.length) {
      process.stderr.write("\n" + key + " missing from replay (max 12):\n");
      process.stderr.write(JSON.stringify(missing.slice(0, 12), null, 2) + "\n");
      process.stderr.write(key + " extra in replay (max 12):\n");
      process.stderr.write(JSON.stringify(extra.slice(0, 12), null, 2) + "\n");
    }
  }
  process.exit(1);
}
process.stdout.write("Production schema fingerprint matches all columns, constraints, indexes, RLS policies, triggers, functions, grants and extensions.\n");
