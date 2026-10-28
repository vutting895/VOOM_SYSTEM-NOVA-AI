# NOVA source area

This folder is currently a source/reference area, not yet the canonical application root. Its current tracked content includes `frontend/wix-export.html`.

The canonical target architecture is documented in [docs/architecture/nova-target-structure.md](../docs/architecture/nova-target-structure.md).

Rules:
- Do not place a second independently deployable frontend here.
- Treat `frontend/wix-export.html` as a design/reference artifact until its components and assets are reviewed and migrated into the canonical Next.js frontend.
- Keep secrets and local environment files out of Git.
- Do not delete legacy folders until their runtime responsibilities, callers, tests, and deployed endpoints have been mapped.
