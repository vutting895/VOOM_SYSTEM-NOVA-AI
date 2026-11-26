-- Supporting indexes for owner-scoped NOVA Core RLS predicates.
create index if not exists nova_approvals_requested_by_idx on nova.approvals(requested_by);
create index if not exists nova_approvals_decided_by_idx on nova.approvals(decided_by);
create index if not exists nova_audit_events_actor_idx on nova.audit_events(actor);
create index if not exists nova_emergency_stops_requested_by_idx on nova.emergency_stops(requested_by);
