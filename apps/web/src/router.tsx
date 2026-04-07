import { useState, useRef, useEffect } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  Link,
  redirect,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronDown, Shield, Palette, Languages, LogOut, Share2 } from "lucide-react";
import HomePage from "./pages/HomePage.js";
import WritePage from "./pages/WritePage.js";
import WorldPage from "./pages/WorldPage.js";
import LoginPage from "./pages/LoginPage.js";
import RegisterPage from "./pages/RegisterPage.js";
import AdminPage from "./pages/AdminPage.js";
import ReaderPage from "./pages/ReaderPage.js";
import SharesPage from "./pages/SharesPage.js";
import { getToken } from "./lib/auth.js";
import { useAuth } from "./contexts/AuthContext.js";
import { BreadcrumbProvider, useBreadcrumb } from "./contexts/BreadcrumbContext.js";
import { WriteThemeProvider, useWriteTheme } from "./contexts/WriteThemeContext.js";

import ShaderCanvas from "./components/shader/ShaderCanvas.js";

function UserMenu({ user, logout }: { user: { displayName: string; role: string }; logout: () => void }) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useWriteTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isZh = i18n.language?.startsWith("zh");

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    const id = setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handleClick); };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-white/60 hover:text-white transition-colors"
      >
        <span>{user.displayName}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-40 glass-panel-solid rounded-lg py-1 shadow-xl z-50">
          {user.role === "admin" && (
            <Link
              to="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white/70 hover:text-teal-400 hover:bg-white/5 transition-colors"
            >
              <Shield className="w-3.5 h-3.5" />
              {t("header.admin")}
            </Link>
          )}
          <Link
            to="/shares"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white/70 hover:text-teal-400 hover:bg-white/5 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            {t("header.shares")}
          </Link>
          <button
            onClick={() => setTheme(theme === "rain" ? "starfield" : "rain")}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-white/70 hover:text-teal-400 hover:bg-white/5 transition-colors"
          >
            <Palette className="w-3.5 h-3.5" />
            {t(`write.theme_${theme === "rain" ? "starfield" : "rain"}`)}
          </button>
          <button
            onClick={() => i18n.changeLanguage(isZh ? "en" : "zh-CN")}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-white/70 hover:text-teal-400 hover:bg-white/5 transition-colors"
          >
            <Languages className="w-3.5 h-3.5" />
            {isZh ? "English" : "中文"}
          </button>
          <div className="border-t border-white/10 my-1" />
          <button
            onClick={() => { setOpen(false); logout(); }}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-white/70 hover:text-red-400 hover:bg-white/5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            {t("header.logout")}
          </button>
        </div>
      )}
    </div>
  );
}

function requireAuth() {
  if (!getToken()) {
    throw redirect({ to: "/login" });
  }
}

function RootComponent() {
  return (
    <WriteThemeProvider>
      <BreadcrumbProvider>
        <RootInner />
      </BreadcrumbProvider>
    </WriteThemeProvider>
  );
}

function RootInner() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const { breadcrumb, immersive } = useBreadcrumb();
  const { theme } = useWriteTheme();

  return (
    <div className="min-h-screen relative">
      {/* Global shader background */}
      <ShaderCanvas theme={theme} />

      <header className={`border-b border-white/10 bg-white/5 backdrop-blur-sm sticky top-0 z-50 ${immersive ? "hidden" : ""}`}>
        <div className="px-3 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/"
              className="text-lg font-bold text-teal-400 shrink-0"
            >
              {t("header.brand")}
            </Link>
            {breadcrumb && (
              <div className="hidden sm:flex items-center gap-3 min-w-0">
                <span className="text-white/20 shrink-0">/</span>
                {breadcrumb}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-4 text-sm">
            {user && <UserMenu user={user} logout={logout} />}
          </div>
        </div>
      </header>
      <main className="relative z-10">
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

const readerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/s/$shareToken",
  component: ReaderPage,
});

const sharesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shares",
  beforeLoad: requireAuth,
  component: SharesPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  homeRoute,
  worldDetailRoute,
  writeRoute,
  adminRoute,
  readerRoute,
  sharesRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
