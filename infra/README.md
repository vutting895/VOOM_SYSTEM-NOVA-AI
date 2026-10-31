# Infrastructure

Local development is provided by `docker-compose.yml`. Kubernetes manifests and production deployment are intentionally withheld until service health checks, auth boundaries, secret management, and regression tests are in place.

## Local Compose boundary

- Compose runs the local frontend and the MCP stdio development process only.
- The frontend container must not receive broker API keys, MT5 Bridge tokens, or other provider credentials. The frontend does not own or retrieve provider credentials.
- Do not add credentials as `NEXT_PUBLIC_*` variables, Compose environment values, build arguments, or browser-visible configuration.
- Platform-level provider credentials (for example the NOVA Gemini provider key) belong in the existing Cloudflare Worker Secret store for the Worker that consumes them.
- Future customer-owned provider credentials must be handled by the authenticated System Integration Hub through an approved server-only vault path. Credential writes remain disabled until the dedicated role, owner binding, privilege audit, and two-customer staging tests pass.
- Exness MT5 terminal/Bridge secrets remain in the existing per-tenant Bridge/Relay provisioning boundary. Do not copy them into the customer credential vault or the frontend container.

## Cloudflare Worker development

Use Wrangler from the relevant existing integration directory and its checked-in Worker configuration. Do not create a second API gateway or duplicate the System Integration Hub. Production deployment is handled by the repository's reviewed GitHub Actions workflows after the required checks pass.
