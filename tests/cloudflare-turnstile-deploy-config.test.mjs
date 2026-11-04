import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const deploy = readFileSync(new URL("../.github/workflows/cloudflare-deploy.yml", import.meta.url), "utf8");
const login = readFileSync(new URL("../frontend/app/login/page.jsx", import.meta.url), "utf8");

test("Cloudflare frontend deployment never falls back to a hard-coded Turnstile site key", () => {
  assert.match(deploy, /NEXT_PUBLIC_TURNSTILE_SITE_KEY:\s*\$\{\{\s*secrets\.NEXT_PUBLIC_TURNSTILE_SITE_KEY\s*\|\|\s*vars\.NEXT_PUBLIC_TURNSTILE_SITE_KEY\s*\}\}/);
  assert.doesNotMatch(deploy, /NEXT_PUBLIC_TURNSTILE_SITE_KEY:.*0x[0-9A-Za-z]+/);
});

test("Cloudflare frontend deployment fails closed when the Turnstile site key is absent", () => {
  assert.match(deploy, /-z "\$NEXT_PUBLIC_TURNSTILE_SITE_KEY"/);
  assert.match(deploy, /Cloudflare frontend deployment blocked/);
  assert.match(login, /if \(!siteKey\)/);
  assert.match(login, /disabled=\{busy \|\| !siteKey \|\| !captchaToken\}/);
});

test("Turnstile remains a public site-key-only browser integration", () => {
  assert.match(login, /NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  assert.match(login, /captchaToken/);
  assert.match(login, /captchaToken,/);
  assert.doesNotMatch(login, /TURNSTILE_SECRET_KEY/);
});
