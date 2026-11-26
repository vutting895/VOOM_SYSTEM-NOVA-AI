import netlify from "@netlify/vite-plugin-tanstack-start";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/** Keep the shared Lovable Vite defaults, but let Netlify own the Start runtime adapter. */
export default defineConfig({
  nitro: false,
  vite: {
    build: {
      // The Netlify UI obfuscator uses an older parser that cannot read ES2022 class static blocks.
      // Lower emitted syntax to ES2021 before its post-build hook runs.
      target: "es2021",
    },
  },
  plugins: [netlify()],
});
