import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/nova/api";
import { isApiConfigured } from "@/lib/nova/config";

/** Read-only API query; disabled (and reported as not configured) when no API base URL. */
export function useNovaQuery<T>(path: string) {
  return useQuery<T, ApiError>({
    queryKey: ["nova", path],
    queryFn: () => api.get<T>(path),
    enabled: isApiConfigured,
    retry: 1,
    refetchInterval: 30_000,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["nova", "health"],
    queryFn: () => api.health(),
    enabled: isApiConfigured,
    retry: 0,
    refetchInterval: 15_000,
  });
}