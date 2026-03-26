import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { queryClient } from "../lib/trpc";
import { getToken, setToken, removeToken, getTokenSync } from "../lib/auth";
import { getApiBaseUrlSync } from "../lib/config";

interface AuthUser {
  _id: string;
  email: string;
  displayName: string;
  role: "admin" | "user";
  permissionGroupId?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchTrpc(procedure: string, input: any) {
  const baseUrl = getApiBaseUrlSync();
  const token = getTokenSync();
  const res = await fetch(`${baseUrl}/trpc/${procedure}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (json.error) {
    const msg = json.error.message || JSON.stringify(json.error.json?.data || json.error);
    throw new Error(msg);
  }
  return json.result?.data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasToken, setHasToken] = useState(false);

  // Check for existing token on mount and restore user
  useEffect(() => {
    getToken().then(async (token) => {
      if (!token) {
        setIsLoading(false);
        return;
      }
      setHasToken(true);
      try {
        const baseUrl = getApiBaseUrlSync();
        const res = await fetch(`${baseUrl}/trpc/auth.me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.result?.data) {
          setUser(json.result.data as AuthUser);
        } else {
          await removeToken();
          setHasToken(false);
        }
      } catch {
        await removeToken();
        setHasToken(false);
      } finally {
        setIsLoading(false);
      }
    });
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await fetchTrpc("auth.login", { email, password });
      await setToken(result.token);
      setHasToken(true);
      setUser(result.user as AuthUser);
      queryClient.clear();
    },
    []
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const result = await fetchTrpc("auth.register", {
        email, password, displayName,
      });
      await setToken(result.token);
      setHasToken(true);
      setUser(result.user as AuthUser);
      queryClient.clear();
    },
    []
  );

  const logout = useCallback(async () => {
    await removeToken();
    setHasToken(false);
    setUser(null);
    queryClient.clear();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
