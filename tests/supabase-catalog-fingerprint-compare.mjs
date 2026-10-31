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
  process.exit(1);
}
process.stdout.write("Production schema fingerprint matches all columns, constraints, indexes, RLS policies, triggers, functions, grants and extensions.\n");
