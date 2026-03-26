import { useEffect, useState, useMemo } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { trpc, createTrpcClient, queryClient } from "../lib/trpc";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { getApiBaseUrl } from "../lib/config";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { colors } from "../lib/theme";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuth = segments[0] === "(auth)";
    if (!user && !inAuth) {
      router.replace("/(auth)/login");
    } else if (user && inAuth) {
      router.replace("/(tabs)");
    }
  }, [user, isLoading, segments]);

  if (isLoading) return null;
  return <>{children}</>;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getApiBaseUrl().then(() => setReady(true));
  }, []);

  const trpcClient = useMemo(() => {
    if (!ready) return null;
    return createTrpcClient();
  }, [ready]);

  if (!ready || !trpcClient) return null;

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <AuthProvider>
            <StatusBar barStyle="light-content" />
            <AuthGuard>
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.bg },
                  headerTintColor: colors.text,
                  contentStyle: { backgroundColor: colors.bg },
                  headerShown: false,
                }}
              />
            </AuthGuard>
          </AuthProvider>
        </I18nextProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
