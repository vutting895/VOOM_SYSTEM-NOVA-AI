# MCP tools

Add small, explicitly allow-listed tools here. Keep MCP on stdio by default. Never expose arbitrary shell, filesystem, broker, or order-placement access through a generic tool. Mutating tools require authorization, audit logging, idempotency, and tests.