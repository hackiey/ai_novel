import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Stack } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { getApiBaseUrl, setApiBaseUrl } from "../../lib/config";
import { useTranslation } from "react-i18next";
import type { ThemeVariant } from "../../lib/theme";
import ThemeBackground from "../../components/backgrounds/ThemeBackground";

const themeOptions: { key: ThemeVariant; color: string }[] = [
  { key: "rain", color: "#0a0c12" },
  { key: "starfield", color: "#050510" },
];


export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { colors, baseStyles: base, themeVariant, setThemeVariant } = useTheme();
  const { t } = useTranslation();
  const [serverUrl, setServerUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");

  useEffect(() => {
    getApiBaseUrl().then((url) => {
      setServerUrl(url);
      setSavedUrl(url);
    });
  }, []);

  const urlUnchanged = serverUrl.trim() === savedUrl;

  async function handleSaveUrl() {
    const trimmed = serverUrl.trim();
    if (!trimmed) return;
    await setApiBaseUrl(trimmed);
    setSavedUrl(trimmed);
    Alert.alert(
      t("settings.saved", "已保存"),
      t("settings.restartHint", "重启应用后生效")
    );
  }

  const s = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[base.flex1, base.bgDark]}>
      <ThemeBackground theme={themeVariant} bgColor={colors.bg} />
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("settings.title"),
        }}
      />

      <ScrollView style={s.scrollContent}>
        {/* User info */}
        <View style={[s.card, base.mb6]}>
          <Text style={[base.textLg, base.mb1]}>
            {user?.displayName}
          </Text>
          <Text style={base.textSm}>{user?.email}</Text>
        </View>

        {/* Appearance */}
        <View style={[s.card, base.mb6]}>
          <Text style={[s.sectionTitle, base.mb3]}>
            {t("settings.appearance")}
          </Text>

          {/* Theme selection */}
          <Text style={[s.subLabel, base.mb2]}>{t("settings.theme")}</Text>
          <View style={[base.row, base.gap3, base.mb4]}>
            {themeOptions.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setThemeVariant(opt.key)}
                style={[
                  s.themeBlock,
                  { backgroundColor: opt.color },
                  themeVariant === opt.key && s.themeBlockActive,
                ]}
              >
                <Text style={[s.themeBlockLabel, themeVariant === opt.key && { color: colors.teal }]}>
                  {t(`settings.theme_${opt.key}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

        </View>

        {/* Server URL */}
        <View style={[s.card, base.mb6]}>
          <Text style={[s.sectionTitle, base.mb3]}>
            {t("settings.serverUrl", "服务器地址")}
          </Text>
          <TextInput
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://localhost:3001"
            placeholderTextColor={colors.slate500}
            autoCapitalize="none"
            autoCorrect={false}
            style={[base.input, base.mb3]}
          />
          <TouchableOpacity
            onPress={handleSaveUrl}
            disabled={urlUnchanged}
            style={[
              base.btnPrimary,
              urlUnchanged && base.btnDisabled,
            ]}
          >
            <Text style={[base.textWhite, { fontSize: 13 }]}>
              {t("common.save")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity onPress={logout} style={s.logoutBtn}>
          <Text style={s.logoutText}>
            {t("header.logout")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: 24,
      paddingTop: 8,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text,
    },
    subLabel: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    themeBlock: {
      flex: 1,
      aspectRatio: 1.2,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: "transparent",
      alignItems: "center",
      justifyContent: "flex-end",
      paddingBottom: 8,
    },
    themeBlockActive: {
      borderColor: colors.teal,
    },
    themeBlockLabel: {
      fontSize: 11,
      color: colors.muted,
    },
    logoutBtn: {
      backgroundColor: "rgba(239,68,68,0.12)",
      borderWidth: 1,
      borderColor: "rgba(239,68,68,0.25)",
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: "center",
      marginBottom: 40,
    },
    logoutText: {
      color: colors.red,
      fontWeight: "600",
      fontSize: 15,
    },
  });
}
