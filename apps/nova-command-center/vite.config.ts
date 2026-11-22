import netlify from "@netlify/vite-plugin-tanstack-start";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/**
 * Netlify's TanStack Start adapter owns SSR/function output.
 * Disable the Lovable wrapper's default Nitro target to avoid emitting
 * a Cloudflare-specific deployment bundle alongside Netlify output.
 */
export default defineConfig({
  nitro: false,
  vite: {
    plugins: [netlify()],
  },
});