import type { ReactNode } from "react";
import { useAuth } from "@/lib/nova/auth";
import { hasAtLeast, type NovaRole } from "@/lib/nova/roles";

/** UX-only visibility. The backend MUST independently enforce the same rule. */
export function RoleGate({
  min,
  children,
  fallback = null,
}: {
  min: NovaRole;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { role } = useAuth();
  return <>{hasAtLeast(role, min) ? children : fallback}</>;
}