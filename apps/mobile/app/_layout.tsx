import { useEffect, useState, useMemo } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { View, StatusBar } from "react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { trpc, createTrpcClient, queryClient } from "../lib/trpc";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { ThemeProvider, useTheme } from "../contexts/ThemeContext";
import { getApiBaseUrl } from "../lib/config";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";

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

function ThemedStack() {
  const { colors, themeVariant } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar
        barStyle="light-content"
        translucent={false}
        backgroundColor={colors.bg}
      />
      <AuthGuard>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg + "e6" },
            headerTintColor: colors.text,
            contentStyle: { backgroundColor: colors.bg },
            headerShown: false,
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="world/[worldId]" options={{ headerShown: true }} />
          <Stack.Screen name="chat/[worldId]" options={{ headerShown: true }} />
          <Stack.Screen
            name="project/[projectId]"
            options={{ headerShown: true }}
          />
        </Stack>
      </AuthGuard>
    </View>
  );
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
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <ThemeProvider>
              <AuthProvider>
                <ThemedStack />
              </AuthProvider>
            </ThemeProvider>
          </I18nextProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </SafeAreaProvider>
  );
}
