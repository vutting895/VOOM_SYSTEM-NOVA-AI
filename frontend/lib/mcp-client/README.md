# MCP client boundary

Frontend components must call an authenticated application API, not connect directly to a local stdio MCP process from the browser. Add a server-side adapter with explicit tool allow-listing, timeouts, response validation, and audit metadata before exposing MCP-backed features.