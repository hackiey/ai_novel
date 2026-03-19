import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { QueryClient } from "@tanstack/react-query";
import type { AppRouter } from "../../server/src/routers/index.js";
import { getTokenSync } from "./auth";
import { getApiBaseUrlSync } from "./config";

export const trpc = createTRPCReact<AppRouter>() as ReturnType<
  typeof createTRPCReact<AppRouter>
>;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 1000,
      retry: 1,
    },
  },
});

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${getApiBaseUrlSync()}/trpc`,
      headers() {
        const token = getTokenSync();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getApiBaseUrlSync()}/trpc`,
        headers() {
          const token = getTokenSync();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
