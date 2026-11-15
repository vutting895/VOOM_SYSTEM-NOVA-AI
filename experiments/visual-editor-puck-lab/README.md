# NOVA Puck Dashboard Prototype

Status: **Typed prototype implementation added; local build re-validation pending**

## Isolation
- Repository: `vutting895/VOOM_SYSTEM-NOVA-AI`
- Branch: `experiment/nova-puck-20261115`
- Base: `13006ace85e1c26d9cda61cc9ca51c397114a838`
- This folder is a standalone Vite app under `experiments/`.
- Synthetic fixture data only. No Supabase, Cloudflare, Netlify, broker, trading bridge, credentials, or production API connection.
- Puck's Publish action is relabeled **Export local JSON** and downloads a file in the browser. It does not save to a server.
- No merge or deployment is authorized.

## Prototype scope
- Typed Puck config using `Config<Components, RootProps>`; no `any` config.
- Editable visual layout with Section Heading, Status Card, Safety Notice, and Activity Row blocks.
- Default content explicitly indicates READ-ONLY, LIVE TRADING OFF, and NOT CONNECTED.
- Export action only downloads `nova-puck-layout.json` locally.
- No controls to place orders, change runtime policy, connect accounts, or modify production settings.

## Validation gates
- Previous baseline build passed with 200 Vite modules.
- Previous SSR fixture passed.
- This typed dashboard revision requires a fresh `npm install`, `npm run typecheck`, `npm run build`, local browser smoke test, drag/drop test, and local JSON export test before being considered verified.
- Previous baseline bundle warning: largest minified JS chunk ~829 KB (242 KB gzip); code splitting remains an optimization item.

## Acceptance criteria
1. Strict TypeScript build passes with the typed Puck config.
2. Browser loads the editor and dashboard canvas.
3. Drag/drop and field edits work without runtime errors.
4. Export downloads JSON locally and makes no network request.
5. Production remains untouched.
