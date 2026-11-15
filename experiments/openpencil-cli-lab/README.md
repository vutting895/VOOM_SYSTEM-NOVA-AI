# NOVA OpenPencil Trial

Status: **CLI HTML import and Tailwind JSX export passed with a local Windows path workaround; Desktop not installed**

## Isolation
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Branch: `experiment/nova-openpencil-20261115`
- Base commit: `02480d48c421dab573ac976be6d90d9efb46fa17`
- All source fixtures and exported code are isolated in this experiment folder.
- No production endpoints, data, credentials, deployments, or main-branch changes.

## Host and installation decision
- Host: Windows Server 2016 Datacenter, build 10.0.14393.
- Chrome: 157.0.8103.51.
- OpenPencil stable CLI package: `@open-pencil/cli@0.16.0`.
- Official Desktop requirements list Windows 10 or later and Edge WebView2 Evergreen. Server 2016 is not explicitly listed as a supported Desktop target, so the Desktop installer was not run.
- CLI help and command discovery work on this host.

## CLI experiment
1. Imported synthetic fixture `dashboard-fixture.html` into a `.fig` document.
2. Import summary: 1 page, 1 root element.
3. Exported the document using `--format tailwind-jsx`.
4. Export completed successfully and produced `dashboard-fixture.tailwind.jsx` (about 2.9 KB).
5. CLI help exposes `tokens --format tailwind` for Tailwind v4 theme output. A custom design-token round trip was not tested.

## Windows-specific blocker and workaround
- First import failed while resolving CanvasKit WASM. The runtime attempted to open `C:\\C:\\Users\\...\\canvaskit.wasm` even though the WASM file existed.
- For this isolated test only, the installed dependency file `node_modules/@open-pencil/core/dist/canvaskit.js` was patched to strip the leading slash before a Windows drive letter.
- This patch is local to the temporary `node_modules`; it is **not** part of the repository branch and must not be treated as an upstream fix.

## Export quality finding
- The JSX export is generated, but it does not preserve all source Tailwind layout classes faithfully. In this fixture, the source `grid grid-cols-3` section exported as a flex-column container.
- Some colors are emitted as explicit hex values rather than NOVA design tokens.
- Therefore, output needs visual and CSS review before reuse. Do not assume a lossless HTML/Tailwind round trip.

## Decision
OpenPencil CLI can perform HTML-to-FIG-to-JSX export on this Windows host after a local CanvasKit path workaround. This proves a limited export path, not Desktop compatibility, interactive visual editing, direct editing of existing NOVA React files, or faithful Tailwind 4 token migration. Keep the generated artifact experimental; do not merge or deploy.
