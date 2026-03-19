import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { trpc, queryClient } from "../lib/trpc";
import { getToken, setToken, removeToken } from "../lib/auth";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasToken, setHasToken] = useState(false);

  const loginMutation = trpc.auth.login.useMutation();
  const registerMutation = trpc.auth.register.useMutation();

  // Check for existing token on mount
  useEffect(() => {
    getToken().then((token) => {
      setHasToken(!!token);
      if (!token) setIsLoading(false);
    });
  }, []);

  // Restore user from token
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: hasToken,
    retry: false,
  });

  useEffect(() => {
    if (!hasToken) return;
    if (meQuery.data) {
      setUser(meQuery.data as unknown as AuthUser);
      setIsLoading(false);
    } else if (meQuery.error) {
      removeToken().then(() => {
        setHasToken(false);
        setUser(null);
        setIsLoading(false);
      });
    }
  }, [meQuery.data, meQuery.error, hasToken]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await loginMutation.mutateAsync({ email, password });
      await setToken(result.token);
      setHasToken(true);
      setUser(result.user as unknown as AuthUser);
      queryClient.clear();
    },
    [loginMutation]
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const result = await registerMutation.mutateAsync({
        email,
        password,
        displayName,
      });
      await setToken(result.token);
      setHasToken(true);
      setUser(result.user as unknown as AuthUser);
      queryClient.clear();
    },
    [registerMutation]
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
