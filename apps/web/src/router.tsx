import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  Link,
} from "@tanstack/react-router";
import HomePage from "./pages/HomePage.js";
import WritePage from "./pages/WritePage.js";
import WorldPage from "./pages/WorldPage.js";

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="px-6 py-3 flex items-center gap-6">
          <Link
            to="/"
            className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent"
          >
            AI Novel
          </Link>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  ),
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const worldDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/world/$worldId",
  component: WorldPage,
});

const writeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/project/$projectId/write",
  validateSearch: (search: Record<string, unknown>) => ({
    chapterId: typeof search.chapterId === "string" ? search.chapterId : undefined,
  }),
  component: WritePage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  worldDetailRoute,
  writeRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
