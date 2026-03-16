import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  Link,
  redirect,
} from "@tanstack/react-router";
import HomePage from "./pages/HomePage.js";
import WritePage from "./pages/WritePage.js";
import WorldPage from "./pages/WorldPage.js";
import LoginPage from "./pages/LoginPage.js";
import RegisterPage from "./pages/RegisterPage.js";
import AdminPage from "./pages/AdminPage.js";
import { getToken } from "./lib/auth.js";
import { useAuth } from "./contexts/AuthContext.js";

function requireAuth() {
  if (!getToken()) {
    throw redirect({ to: "/login" });
  }
}

function RootComponent() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="px-6 py-3 flex items-center justify-between">
          <Link
            to="/"
            className="text-lg font-bold text-teal-600"
          >
            AI Novel
          </Link>
          {user && (
            <div className="flex items-center gap-4 text-sm">
              {user.role === "admin" && (
                <Link to="/admin" className="text-gray-600 hover:text-teal-600 transition-colors">
                  管理
                </Link>
              )}
              <span className="text-gray-500">{user.displayName}</span>
              <button
                onClick={logout}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                登出
              </button>
            </div>
          )}
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

const rootRoute = createRootRoute({
  component: RootComponent,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  component: RegisterPage,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: requireAuth,
  component: HomePage,
});

const worldDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/world/$worldId",
  beforeLoad: requireAuth,
  component: WorldPage,
});

const writeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/project/$projectId/write",
  beforeLoad: requireAuth,
  validateSearch: (search: Record<string, unknown>) => ({
    chapterId: typeof search.chapterId === "string" ? search.chapterId : undefined,
  }),
  component: WritePage,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  beforeLoad: requireAuth,
  component: AdminPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  homeRoute,
  worldDetailRoute,
  writeRoute,
  adminRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
