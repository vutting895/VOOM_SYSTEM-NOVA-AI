# NOVA Puck Dashboard Prototype

Status: **Build, field editing and pointer drag/drop passed; browser file download remains unverified**

## Isolation
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Branch: `experiment/nova-puck-20261115`
- Base: `02480d48c421dab573ac976be6d90d9efb46fa17`
- Standalone Vite app under `experiments/visual-editor-puck-lab`.
- Synthetic fixture data only. No Supabase, Cloudflare, Netlify, broker, trading bridge, credentials, or production API connection.
- Puck's Publish action is relabeled **Export local JSON** and generates a browser-local JSON Blob. No server persistence or network integration is configured.
- No merge or deployment.

## Prototype scope
- Strictly typed Puck config: `Config<Components, RootProps>`; no `any` config.
- Editable visual layout with Section Heading, Status Card, Safety Notice, and Activity Row blocks.
- Defaults explicitly indicate READ-ONLY, LIVE TRADING OFF, and NOT CONNECTED.
- No controls to place orders, change runtime policy, connect accounts, or modify production settings.
- Direct dependencies are pinned to exact versions in `package.json`; no generated lockfile is committed.

## Validation evidence
- `npm install --no-audit --no-fund`: completed for local validation; generated lockfile removed from the experiment because reproducible lockfile generation was not validated.
- `npm run typecheck`: passed.
- `npm run build`: passed; Vite transformed 200 modules.
- `node render-check.mjs`: passed (`PUCK_RENDER_CHECK=PASS`).
- Local Vite app loaded in Chrome Headless at `http://127.0.0.1:4178/`; editor shell, Blocks palette, Page fields, canvas and 7 fixture layers rendered.
- Safety notice `READ-ONLY / LIVE TRADING OFF` was confirmed inside the preview iframe.
- Field-edit interaction: selected the Runtime Status Card, changed `SANDBOX` to `INTERACTION_TEST_OK`, and confirmed the preview reflected the new value. **PASS**
- Export action: invoked the visible `Export local JSON` control, intercepted the browser-local Blob, parsed it as valid JSON, and confirmed all 7 fixture components plus the safety notice were present. **BLOB GENERATION PASS; actual file download not verified**
- Network observation: page/module requests were limited to `127.0.0.1:4178`; other observed URLs were a data URI and a same-origin Blob URL. No external/production request observed during this test.
- Pointer drag/drop: dragged an Activity Row from the Blocks palette into the root canvas using Chrome pointer events; a new `ActivityRow-*` component appeared in the canvas and its fields opened in the editor. **PASS**. Keyboard drag was not verified.
- Largest minified JS chunk ~833 KB (243.7 KB gzip); code splitting remains an optimization item.

## Acceptance criteria
1. Strict TypeScript check and production build pass. **PASS**
2. Browser loads the editor and dashboard canvas. **PASS**
3. Field editing updates the preview. **PASS**
4. Pointer drag/drop adds a component to the canvas. **PASS**
5. Export creates valid local JSON without external network requests. **BLOB PASS; actual browser download NOT VERIFIED**
6. Production remains untouched. **PASS — main SHA unchanged; no merge/deploy**
