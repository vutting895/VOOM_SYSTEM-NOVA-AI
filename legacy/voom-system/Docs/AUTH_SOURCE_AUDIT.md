Voom_system Customer Authentication Source Audit
Date: 2026-10-23
Status: PARTIAL IMPLEMENTATION — Supabase Auth sign-in and UI staff-role gate added; live account provisioning and server-side admin APIs remain pending.

## Current state
- Supabase project: tlyyxufuiimrbaksoitf.
- public.customer_profiles.role added by migration `voom_auth_roles`; values: customer, staff, admin; default is customer.
- Authenticated browser role cannot update the role column: only display_name has update grant.
- Dashboard files: Dashboard/index.html, app.css, auth.js, app.js.
- Frontend sign-in uses Supabase Auth password flow and queries only the signed-in user's own customer_profiles row.
- Dashboard UI permits active staff/admin roles; customer and suspended accounts are denied.
- Frontend uses the publishable key only. No service-role key is present in browser files.
- Public sign-up is not implemented. Owner must provision staff users in Supabase Auth and assign a role to the verified UUID using trusted SQL/admin workflow.
- The UI gate is not a replacement for server-side authorization. No real customer directory, security-event or risk-decision API is connected yet.
- Keep dashboard bound to 127.0.0.1 or private VPN; do not expose publicly.
- MT5 order path unchanged; live trading remains disabled.

## Staff provisioning
1. Create staff user in Supabase Dashboard → Authentication → Users.
2. Verify the email/account identity and copy the exact Auth UUID.
3. In SQL Editor update `public.customer_profiles.role` to `staff` or `admin` for that UUID and active account.
4. Verify exactly one row updated.
5. Test login with staff account and separately test a customer-role account is denied.
6. Before adding data APIs, enforce JWT verification and role checks server-side. Privileged Supabase credentials must remain in backend environment only.

## Still blocked/pending
- Live login test needs an owner-provisioned staff account.
- No server-side staff/customer directory endpoint.
- No security event source connected.
- No server-side JWT+role authorization endpoint for admin-only data.
- No authenticated customer account source was found in the prior local source audit.
