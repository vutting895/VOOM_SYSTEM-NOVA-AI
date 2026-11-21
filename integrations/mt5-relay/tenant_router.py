"""Fail-closed, server-side tenant routing for read-only MT5 bridge connections."""
from dataclasses import dataclass
from enum import Enum
from typing import Dict, Mapping, Optional, Tuple


READ_ONLY_CAPABILITIES = frozenset({"health.read", "account.read", "symbols.read", "quotes.read"})


class BridgeReadiness(str, Enum):
    unavailable = "unavailable"
    configured = "configured"
    reachable = "reachable"
    authenticated = "authenticated"
    data_verified = "data_verified"
    stale = "stale"
    incomplete = "incomplete"


@dataclass(frozen=True)
class TenantRoute:
    user_id: str
    connection_id: str
    bridge_id: str
    capabilities: frozenset
    active: bool = True


class TenantRouteRegistry:
    """Resolve only an authenticated user + their connection ID; no global fallback."""

    def __init__(self, routes: Mapping[Tuple[str, str], TenantRoute]) -> None:
        self._routes: Dict[Tuple[str, str], TenantRoute] = dict(routes)

    def resolve(self, *, authenticated_user_id: str,
                connection_id: str) -> TenantRoute:
        if not authenticated_user_id or not connection_id:
            raise PermissionError("tenant route unavailable")
        route = self._routes.get((authenticated_user_id, connection_id))
        if route is None or not route.active:
            raise PermissionError("tenant route unavailable")
        if route.user_id != authenticated_user_id or route.connection_id != connection_id:
            raise PermissionError("tenant route mismatch")
        if not route.capabilities or not route.capabilities.issubset(READ_ONLY_CAPABILITIES):
            raise PermissionError("bridge is not strictly read-only")
        return route


def evaluate_bridge_readiness(*, configured: bool, reachable: bool = False,
                              authenticated: bool = False, data_verified: bool = False,
                              observed_at=None, max_age_seconds: Optional[float] = None,
                              now=None) -> BridgeReadiness:
    if not configured:
        return BridgeReadiness.unavailable
    if not reachable:
        return BridgeReadiness.configured
    if not authenticated:
        return BridgeReadiness.reachable
    if not data_verified:
        return BridgeReadiness.incomplete
    if observed_at is None or max_age_seconds is None:
        return BridgeReadiness.incomplete
    from workers.jobs.runner import evaluate_freshness
    freshness = evaluate_freshness(observed_at, max_age_seconds=max_age_seconds, now=now)
    return BridgeReadiness.data_verified if freshness == "fresh" else (
        BridgeReadiness.stale if freshness == "stale" else BridgeReadiness.incomplete
    )
