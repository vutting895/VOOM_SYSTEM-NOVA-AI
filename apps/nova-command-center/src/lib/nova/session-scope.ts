export function hasUserIdentityChanged(
  previousUserId: string | null,
  nextUserId: string | null,
): boolean {
  return previousUserId !== nextUserId;
}

export function userScopedQueryKey(userId: string | null, path: string) {
  return ["nova", userId ?? "signed-out", path] as const;
}
