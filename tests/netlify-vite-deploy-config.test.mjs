import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [netlifyConfig, packageSource, html, viteConfig] = await Promise.all([
  readFile(new URL("../netlify.toml", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
]);
const packageJson = JSON.parse(packageSource);

test("Netlify builds the root Vite application and publishes its dist directory", () => {
  assert.match(netlifyConfig, /^\s*base\s*=\s*"\."\s*$/m);
  assert.match(netlifyConfig, /^\s*command\s*=\s*"npm run build"\s*$/m);
  assert.match(netlifyConfig, /^\s*publish\s*=\s*"dist"\s*$/m);
  assert.equal(packageJson.scripts?.build, "vite build");
});

test("Netlify serves client-side routes through the Vite application entry point", () => {
  assert.match(netlifyConfig, /^\s*from\s*=\s*"\/\*"\s*$/m);
  assert.match(netlifyConfig, /^\s*to\s*=\s*"\/index\.html"\s*$/m);
  assert.match(netlifyConfig, /^\s*status\s*=\s*200\s*$/m);
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /src="\/src\/main\.tsx"/);
});

test("Vite configuration is present at repository root", () => {
  assert.match(viteConfig, /defineConfig/);
  assert.match(viteConfig, /@vitejs\/plugin-react/);
  assert.match(viteConfig, /@tailwindcss\/vite/);
});
