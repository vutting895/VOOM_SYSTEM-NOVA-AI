# YouTube Direct Manager — API Contract (Draft)

Status: source-only draft on a feature branch. No production route is wired, no OAuth client is configured, no token is stored, and no Worker deployment is authorized.

## 1. Placement and boundaries

The first implementation is an isolated adapter under `integrations/system-hub/adapters/youtube-data-readonly.js`. It reuses the existing `voom-system-hub` codebase as a future integration module; it does not create a new Worker, modify the active Hub router, change Wrangler configuration, or alter deployment workflows.

The adapter is server-side only. Callers must obtain an access token from a future approved OAuth/token service and pass it internally. Browser clients and MCP callers must never provide or receive Google access/refresh tokens.

## 2. OAuth contract (proposed; not implemented)

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/youtube/oauth/start` | GET | Start Google Authorization Code flow; create a cryptographically random, single-use state and PKCE verifier bound to the authenticated NOVA user |
| `/v1/youtube/oauth/callback` | GET | Validate state, exchange code server-side, validate granted scopes, persist encrypted token material |
| `/v1/youtube/connection` | GET | Return connection state and granted scope names only; never token values |
| `/v1/youtube/disconnect` | POST | Revoke the Google grant where supported and delete the user's stored token material |

Required initial scopes:
- `https://www.googleapis.com/auth/youtube.readonly`
- `https://www.googleapis.com/auth/yt-analytics.readonly`

OAuth requirements:
- Authorization Code flow with PKCE (S256), exact registered HTTPS redirect URI, single-use state, short state TTL, and authenticated user binding.
- Request offline access only when required for scheduled/background reads. Treat refresh tokens as high-value secrets; encrypt at rest with a separately managed key and never log them.
- Validate the actual granted scopes; reject unexpected write scopes. No scope containing upload, force-ssl write, partner, or other mutation capability is allowed in this phase.
- Keep client secret, refresh token, encryption key, and access token out of source control, browser storage, URL query strings, analytics, and logs.
- Do not use a service account as a substitute for channel-owner OAuth unless YouTube explicitly supports the intended channel ownership model.

## 3. Read-only REST API (proposed; not wired)

All endpoints require the existing authenticated NOVA session. Server-side ownership checks resolve the current user's YouTube connection. The Google token is injected only inside the Worker adapter boundary.

| Endpoint | Method | Upstream operation | Bounds |
|---|---|---|---|
| `/v1/youtube/channel` | GET | YouTube Data API `channels.list?mine=true` | One channel result |
| `/v1/youtube/videos` | GET | `playlistItems.list` against the channel Uploads playlist | 1–50 items/page |
| `/v1/youtube/videos/stats` | GET | `videos.list` | 1–50 unique video IDs |
| `/v1/youtube/analytics` | GET | YouTube Analytics API `reports.query` with `ids=channel==MINE` | Explicit date range; allowlisted metrics/dimensions |

Initial analytics metric allowlist: `views`, `estimatedMinutesWatched`, `averageViewDuration`, `subscribersGained`, `subscribersLost`, `likes`, `comments`, `shares`.

Initial dimension allowlist: `day`, `video`, `country`, `deviceType`, `trafficSourceType`.

The adapter intentionally does not accept arbitrary upstream URLs, arbitrary query parameters, caller-supplied authorization headers, or mutation methods. It pins HTTPS API origins, uses GET only, rejects redirects, applies a timeout, validates IDs and bounds, and maps provider failures to sanitized error codes.

## 4. Future MCP tool contract

- `youtube_connection_status`
- `youtube_get_channel`
- `youtube_list_videos`
- `youtube_get_video_stats`
- `youtube_get_analytics`
- `youtube_disconnect`

MCP tools must call the same authenticated service layer. They must not accept raw Google tokens, arbitrary URLs, write scopes, or mutation instructions.

## 5. Explicit exclusions

- No upload, publish, edit, delete, comment, moderation, playlist mutation, or live-stream control.
- No YouTube Studio UI scraping or browser automation.
- No vidIQ dependency.
- No frontend exposure of Google credentials.
- No new Cloudflare Worker in this phase.
- No production route registration, database migration, secret creation, OAuth consent, deployment, or production configuration change.

## 6. Acceptance gates before route wiring

1. Select and review encrypted token storage with per-user isolation, rotation/revocation behavior, and recovery plan.
2. Verify Google Cloud project ownership, YouTube Data API v3 and YouTube Analytics API enablement, OAuth consent configuration, and exact redirect URI.
3. Add tests for state replay, CSRF, PKCE mismatch, token refresh, scope escalation rejection, cross-user access, token redaction, provider timeout, quota exhaustion, and disconnect.
4. Confirm API metrics/dimensions against the actual channel and API response; unsupported YouTube Studio-only metrics must be labeled unavailable rather than inferred.
5. Run local tests and PR CI. Review the diff and CI before any production approval.

## 7. Current implementation status

- Read-only Data API adapter source: added in this branch.
- Unit tests: added in this branch; execution still pending CI/local test evidence.
- OAuth flow and token storage: not implemented.
- System Hub route registration: not implemented.
- MCP tool registration: not implemented.
- Google Cloud credentials and consent: not configured.
- Production: unchanged.
