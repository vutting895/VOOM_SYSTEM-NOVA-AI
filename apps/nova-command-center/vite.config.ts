import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import netlify from "@netlify/vite-plugin-tanstack-start";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Netlify already provides NEXT_PUBLIC_* Supabase variables. Only public values
  // are exposed by this prefix; provider/broker secrets remain server-side.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  plugins: [tanstackStart(), react(), tailwindcss(), tsconfigPaths(), netlify()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    hmr: false,
  },
});
