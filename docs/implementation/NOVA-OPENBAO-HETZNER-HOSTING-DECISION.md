# NOVA OpenBao Staging — Hosting Decision Addendum

**Decision date:** 2026-10-31  
**Repository:** vutting895/VOOM_SYSTEM-NOVA-AI  
**Applies to:** OpenBao Staging host only  
**Supersedes:** The OCI-host candidate in the closure checklist and architecture document for the next Staging provisioning attempt.  
**Status:** PROVIDER SELECTED FOR PLANNING — NOT PROVISIONED

## 1. Decision

Use **Hetzner Cloud, Singapore (SIN)** as the next candidate host for the isolated NOVA OpenBao Staging environment. Do not block this work on recovery of the existing OCI tenancy. Keep OCI account recovery as a separate task; do not delete or modify the OCI tenancy.

Hetzner offers Cloud servers in Singapore, Ubuntu images, private Networks, and firewall controls. Its server-creation flow supports a server with no public IPv4 and/or IPv6; documentation describes a private-network-only server option. Cloudflare Tunnel requires outbound connectivity, so the proposed configuration is **IPv6-only public egress with no public IPv4**, plus a private Hetzner Network for private addressing. Validate this in the live Console before purchase.

## 2. Proposed Staging size and cost gate

Preferred starting size: **CPX22** in Singapore:
- 2 shared AMD vCPUs
- 4 GB RAM
- 80 GB NVMe
- Ubuntu LTS image (select a currently supported LTS release)
- One private Hetzner Network
- IPv6 only for outbound tunnel connectivity; no public IPv4
- Hetzner Firewall blocks all unsolicited inbound traffic

The official Hetzner June 15, 2026 price adjustment lists Singapore CPX22 at **€26.49/month excluding VAT and public IPv4**. A current independent catalog reports €26.99/month; the final amount, tax, IP pricing, and optional add-ons must be checked in the Hetzner Console before pressing Create & Buy Now. Do not enable backups, volumes, snapshots, load balancers, or other billable add-ons until separately costed and approved.

Hetzner bills servers while they exist, including powered-off servers. Deleting the server is required to stop server charges. Do not assume this host is free.

## 3. Network and security design

- Attach the server to a dedicated private Network and assign a private address.
- Do not allocate a public IPv4 address.
- Enable IPv6 only if required for outbound Cloudflare connectivity; verify cloudflared can establish QUIC over IPv6 to Cloudflare's published IPv6 endpoints.
- Deny all unsolicited inbound traffic at the Hetzner Firewall and host firewall. Do not expose SSH (22), OpenBao (8200), Raft (8201), or health endpoints publicly.
- Allow only required outbound traffic: DNS and Cloudflare Tunnel QUIC on UDP 7844 to the documented Cloudflare tunnel destinations. Add TCP 443 only for explicitly required updates/support endpoints.
- Use a dedicated new remotely managed Cloudflare Tunnel for OpenBao Staging; do not repurpose voom-readonly-bridge or voomsystem.netlify.app.
- Use Cloudflare Workers VPC VPC Service (fixed host and port) rather than broad VPC Network binding for the OpenBao HTTP endpoint. Keep TLS verification at verify_full.
- Keep OpenBao bound to the private interface only. Raft peer port 8201 remains private and is not routed through the Worker binding.
- For operator access, use Hetzner web console initially and evaluate a separate authenticated Cloudflare Access SSH path; do not open inbound SSH as a shortcut.

## 4. Ordered implementation gates

1. User creates/signs in to the Hetzner account and reviews the exact checkout price, tax, IPv6 availability, Singapore capacity, and billing method.
2. Before purchase, verify CPX22 / Singapore / Ubuntu LTS / 80 GB root disk / private Network / IPv6-only public egress / no IPv4 / no paid add-ons.
3. Obtain explicit user approval of the displayed recurring cost. Until then, do not create the server or any paid network/storage resources.
4. Create the server and capture evidence of server state, location, shape, attached private Network/private IP, public IPv4 disabled, IPv6 egress, and firewall rules. Redact account identifiers.
5. Verify outbound QUIC/UDP 7844 to Cloudflare over IPv6 and confirm no inbound public ports are reachable.
6. Only after the host and secure operator path are verified, create a new dedicated Cloudflare Tunnel and a single fixed-host/port VPC Service. Verify account role permissions first.
7. Install pinned OpenBao release with Raft, persistent encrypted storage, TLS, Shamir unseal, protected audit logs and encrypted backup/restore rehearsal.
8. Run synthetic-only health, Transit, fail-closed, and two-owner tenant-isolation tests. Do not use real broker or customer credentials.

## 5. Non-actions and safety

This decision addendum does not create an account, server, Network, Firewall, Tunnel, VPC Service, Worker binding, DNS record, secret, token, or deployment. It does not modify OCI, existing Cloudflare tunnels, Supabase, Production, customer records, Exness connections, or trading flags.

Exness remains Demo/read-only. Order Submission OFF. Live Trading OFF. No private key, API token, recovery share, password, or tunnel token may be placed in chat or GitHub.

## References

- Hetzner Singapore Cloud: https://www.hetzner.com/cloud-singapore/
- Hetzner server creation and networking options: https://docs.hetzner.com/cloud/servers/getting-started/creating-a-server/
- Hetzner server overview and IP pricing: https://docs.hetzner.com/cloud/servers/overview/
- Hetzner Singapore pricing adjustment (June 15, 2026): https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
- Cloudflare Workers VPC Services: https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/
- Cloudflare Tunnel firewall and IPv6 endpoints: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/
- Cloudflare Workers VPC Tunnel requirements: https://developers.cloudflare.com/workers-vpc/configuration/tunnel/
