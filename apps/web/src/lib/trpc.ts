import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { QueryClient } from "@tanstack/react-query";
import type { AppRouter } from "../../../server/src/routers/index.js";

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
export const trpc = createTRPCReact<AppRouter>() as ReturnType<typeof createTRPCReact<AppRouter>>;

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
      url: "http://localhost:3001/trpc",
    }),
  ],
});
