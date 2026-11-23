import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/nova/api";
import { isApiConfigured } from "@/lib/nova/config";
import { useAuth } from "@/lib/nova/auth";
import { userScopedQueryKey } from "@/lib/nova/session-scope";

/** Protected API data is isolated by authenticated identity and disabled before sign-in. */
export function useNovaQuery<T>(path: string) {
  const { userId, status } = useAuth();
  return useQuery<T, ApiError>({
    queryKey: userScopedQueryKey(userId, path),
    queryFn: () => api.get<T>(path),
    enabled: isApiConfigured && status === "signed_in" && Boolean(userId),
    retry: 1,
    refetchInterval: 30_000,
  });
}

/** Public health is intentionally not scoped to an authenticated identity. */
export function useHealth() {
  return useQuery({
    queryKey: ["nova", "health"],
    queryFn: () => api.health(),
    enabled: isApiConfigured,
    retry: 0,
    refetchInterval: 15_000,
  });
}
