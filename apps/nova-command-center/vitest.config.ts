import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    runner: "@circleci/vitest-circleci-coverage/runner",
    reporters: ["default", "junit", "@circleci/vitest-circleci-coverage/reporter"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});