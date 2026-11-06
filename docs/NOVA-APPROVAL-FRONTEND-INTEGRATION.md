# NOVA Research Approval — Frontend Integration Contract

This document is the integration hand-off for the NOVA frontend. It describes the API/session contract only; it does not prescribe page layout or UI styling.

## Session source

The root Vite SPA now mounts \`SupabaseSessionProvider\` in \`src/main.tsx\`. Components can access the current authenticated identity and API client with:

\`\`\`tsx
import { useSupabaseSession } from "../providers/SupabaseSessionProvider";

function ApprovalFeature() {
  const { isConfigured, loading, user, approvalApi, signOut } = useSupabaseSession();

  if (!isConfigured) return null; // Show the app's own configuration/auth-required state.
  if (loading) return null;       // Wait for Supabase INITIAL_SESSION.
  if (!user || !approvalApi) return null; // Do not create a local or synthetic owner identity.

  // Use approvalApi from the event handler/effect after the user's session is ready.
  return null;
}
\`\`\`

The provider:
- Uses only \`VITE_SUPABASE_URL\` and \`VITE_SUPABASE_PUBLISHABLE_KEY\` (or the legacy anon-key alias).
- Accepts no service-role key.
- Tracks Supabase \`onAuthStateChange\`, including initial session, refresh and sign-out.
- Exposes the authenticated \`user\`, \`loading\`, \`signOut\`, and \`approvalApi\`.
- Does not expose the session object/access token directly through React context.
- Supplies a callback to the API service; the service calls it on each request to obtain the current token.

Set these public Vite variables in the Netlify site environment for the root SPA. Never put the service-role key into a \`VITE_*\` variable.

## Thread identity and ownership

Do not reuse the legacy \`nova_langgraph_thread_id\` value from browser localStorage. It is a display/legacy thread string, not a server-owned UUID.

Create a durable server thread after a verified authenticated session is present:
- \`approvalApi.createThread(title?)\`
- Keep the returned \`thread.id\` as the active Approval API thread for the current authenticated user.
- Load it through \`approvalApi.listThreads()\` when restoring the user's workspace.
- On sign-out or identity change, clear all component state and discard in-flight responses associated with the prior user. A thread ID is not an authorization token.

## API client

The client is \`src/services/novaApprovalApi.ts\`. It exposes:

| Method | Purpose |
|---|---|
| \`listThreads(state?)\` | List the signed-in user's thread metadata |
| \`createThread(title?)\` | Create a server-owned thread |
| \`listApprovals(threadId)\` | List drafts for a thread owned by the caller |
| \`createApproval(threadId, proposal)\` | Submit a strict \`strategy_draft_review\` |
| \`decideApproval(approvalId, decision)\` | Approve, reject or edit a pending research draft |

The API base defaults to \`https://voom-system-hub.suwapat787.workers.dev\`. Override it with \`VITE_SYSTEM_HUB_URL\` for a non-production environment.

The client sends the Supabase user JWT as a Bearer token and uses \`cache: "no-store"\`, \`credentials: "omit"\` and \`redirect: "error"\`. It does not store an access token itself.

## Proposal schema

Only these five keys are accepted:
- \`title\` — string, 1–120 characters
- \`summary\` — string, 1–600 characters
- \`market\` — one of \`BTC/USDT\`, \`ETH/USDT\`, \`EUR/USD\`, \`XAU/USD\`, \`US30\`, or null
- \`timeframe\` — one of \`5m\`, \`15m\`, \`1h\`, \`4h\`, \`1d\`, or null
- \`riskProfile\` — one of \`low\`, \`medium\`, \`high\`, or null

Do not send volume, side, order type, broker, account ID, connection ID or execution options.

## Decisions and safety boundary

Decision payloads are one of:
- \`{ decision: "approve", note? }\`
- \`{ decision: "reject", note? }\`
- \`{ decision: "edit", note?, editedProposal }\`

The server returns the resulting approval state. An edit is a saved revision and is not an approval; it must be submitted for a new review.

Approval means a human accepted a research draft only. The API response explicitly reports:
- \`agentGraphResumeEnabled: false\`
- \`ordersEnabled: false\`
- \`executionEnabled: false\`
- \`liveTradingEnabled: false\`
- \`brokerMutationEnabled: false\`

Do not render an accepted review as an executing/active trade, and do not call a graph-resume endpoint from the approval UI.

## Current integration boundary

The session provider and typed service are now present, but the SPA does not yet contain a finished login screen or approval review UI. Gemini can build those views against this contract without changing the backend routes. Do not assume that setting the public env vars creates a session: a real Supabase Auth sign-in flow must first populate the provider's session.

The backend flag \`NOVA_APPROVALS_ENABLED\` remains forced to \`false\` in the Cloudflare deployment workflow. Do not enable it in production until exact-head unit tests, local Supabase Auth user A/B integration, and review are complete.
