import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// This NOVA frontend currently uses build-time SSG pages without ISR.
// Read prerendered pages from the Worker's static assets instead of requiring R2 cache bindings.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
