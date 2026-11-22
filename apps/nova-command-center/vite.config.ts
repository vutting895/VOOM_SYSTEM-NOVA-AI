import netlify from "@netlify/vite-plugin-tanstack-start";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/** Keep the shared Lovable Vite defaults, but let Netlify own the Start runtime adapter. */
export default defineConfig({
  nitro: false,
  plugins: [netlify()],
});
