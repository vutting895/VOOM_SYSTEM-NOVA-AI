"""Fail-closed authentication tests for Learning Engine API routes."""
from fastapi import HTTPException

from backend.learning.api import require_learning_approver, require_learning_user, router


def test_learning_api_authentication_dependency_fails_closed():
    try:
        require_learning_user()
    except HTTPException as exc:
        assert exc.status_code == 503
        assert "authenticated owner/tenant RBAC" in exc.detail
    else:
        raise AssertionError("Learning API must remain disabled without host RBAC")


def test_learning_approval_dependency_fails_closed():
    try:
        require_learning_approver()
    except HTTPException as exc:
        assert exc.status_code == 503
    else:
        raise AssertionError("Model approval must remain disabled without host RBAC")


def test_all_data_routes_require_authenticated_learning_user():
    protected_paths = {
        "/learning/experiences",
        "/learning/performance",
        "/learning/models/candidates",
    }
    routes = {route.path: route for route in router.routes}
    for path in protected_paths:
        assert path in routes
        dependency_calls = {dependency.call for dependency in routes[path].dependant.dependencies}
        assert require_learning_user in dependency_calls, f"{path} is missing owner/tenant authentication"
