import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../skills/external-link-access/SKILL.md", import.meta.url), "utf8");
const design = readFileSync(new URL("../docs/architecture/NOVA-EXTERNAL-LINK-ACCESS.md", import.meta.url), "utf8");

test("external link skill is explicitly read-only and treats retrieved content as untrusted", () => {
  assert.match(skill, /status: proposed/);
  assert.match(skill, /network: mediated/);
  assert.match(skill, /writes: none/);
  assert.match(skill, /code_execution: none/);
  assert.match(skill, /untrusted data/);
  assert.match(skill, /human review/);
});

test("external link skill rejects unsafe schemes, private destinations and redirect escapes", () => {
  for (const marker of ["HTTPS", "localhost", "loopback", "private", "link-local", "metadata", "redirect", "file URLs", "data URLs"]) {
    assert.ok(skill.toLowerCase().includes(marker.toLowerCase()), `missing security rule: ${marker}`);
  }
  assert.match(skill, /Do not follow redirects across an unapproved host/);
  assert.match(skill, /Never forward Supabase, GitHub, Cloudflare, broker/);
});

test("external link capability does not introduce a generic proxy or automatic skill publishing", () => {
  assert.match(design, /No generic URL proxy endpoint/);
  assert.match(design, /human approval/i);
  assert.match(design, /production activation requires separate explicit approval/i);
  assert.match(design, /No broker writes/);
});
