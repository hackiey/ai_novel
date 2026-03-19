import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { getApiBaseUrl, setApiBaseUrl } from "../../lib/config";
import { useTranslation } from "react-i18next";
import { colors, base } from "../../lib/theme";

export default function SettingsScreen() {
  const { user, logout } = useAuth();
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

  return (
    <ScrollView style={[base.flex1, base.bgDark, s.scrollContent]}>
      {/* User info */}
      <View style={[s.card, base.mb6]}>
        <Text style={[base.textLg, base.mb1]}>
          {user?.displayName}
        </Text>
        <Text style={base.textSm}>{user?.email}</Text>
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
          style={[s.input, base.mb3]}
        />
        <TouchableOpacity
          onPress={handleSaveUrl}
          disabled={urlUnchanged}
          style={[
            s.saveBtn,
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
  );
}

const s = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
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
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 13,
  },
  saveBtn: {
    backgroundColor: colors.teal,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  logoutBtn: {
    backgroundColor: colors.redBg,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  logoutText: {
    color: colors.red,
    fontWeight: "600",
    fontSize: 15,
  },
});
