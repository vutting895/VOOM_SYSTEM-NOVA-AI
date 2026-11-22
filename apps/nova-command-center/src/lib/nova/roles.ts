export type NovaRole = "admin" | "operator" | "viewer";
export const ROLES: readonly NovaRole[] = ["admin", "operator", "viewer"];

/**
 * Parse role ONLY from app_metadata.nova_role (server-controlled).
 * user_metadata and legacy app_metadata.role are deliberately ignored.
 * Unknown/missing => null (fail closed).
 * This is for UX display only; the backend must enforce permissions from the verified JWT.
 */
export function parseRole(
  user: { app_metadata?: Record<string, unknown> | null } | null | undefined,
): NovaRole | null {
  const raw = user?.app_metadata?.["nova_role"];
  if (typeof raw !== "string") return null;
  const r = raw.trim().toLowerCase();
  return (ROLES as readonly string[]).includes(r) ? (r as NovaRole) : null;
}

const RANK: Record<NovaRole, number> = { viewer: 1, operator: 2, admin: 3 };

export function hasAtLeast(role: NovaRole | null, required: NovaRole): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[required];
}

export const ROLE_LABEL: Record<NovaRole, string> = {
  admin: "Admin",
  operator: "Operator",
  viewer: "Viewer",
};
