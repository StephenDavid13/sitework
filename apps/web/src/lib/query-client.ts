import { QueryClient } from "@tanstack/react-query";
import { isRetryable } from "@/lib/api/errors";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => isRetryable(error) && failureCount < 2,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
