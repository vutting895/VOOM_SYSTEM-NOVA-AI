# MCP tool development rules

- Add only small, explicitly allow-listed research or validation tools.
- Keep the default transport on stdio. Do not publish an unauthenticated MCP HTTP endpoint.
- Reuse canonical implementations under `workers/`; do not clone strategy logic into this directory.
- Do not expose arbitrary shell, filesystem, provider URL, broker or order-placement access.
- Any future mutating capability requires a separate design, explicit authorization, audit trail, idempotency and cross-tenant tests. This folder currently has no mutating tools.
