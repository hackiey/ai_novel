import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useTranslation } from "react-i18next";
import { getApiBaseUrl, setApiBaseUrl } from "../../lib/config";

export default function LoginScreen() {
  const { login } = useAuth();
  const { colors, baseStyles: base } = useTheme();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [serverSaved, setServerSaved] = useState(false);

  useEffect(() => {
    getApiBaseUrl().then(setServerUrl);
  }, []);

  const isDisabled = loading || !email.trim() || !password;

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      await getApiBaseUrl();
      await login(email.trim(), password);
    } catch (err: any) {
      Alert.alert(t("login.failed"), err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const s = useMemo(() => createStyles(colors), [colors]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[base.flex1, base.bgDark]}
    >
      <View style={s.container}>
        <Text style={[base.text3xl, base.textCenter, base.mb2]}>
          AI Novel
        </Text>
        <Text style={[s.subtitle, base.textCenter, { marginBottom: 40 }]}>
          {t("login.title")}
        </Text>

        <View style={[s.fieldGroup, base.mb6]}>
          <View>
            <Text style={[s.label, base.mb1]}>
              {t("login.email")}
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t("login.email")}
              placeholderTextColor={colors.slate500}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={s.input}
            />
          </View>

          <View style={base.mt4}>
            <Text style={[s.label, base.mb1]}>
              {t("login.password")}
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t("login.password")}
              placeholderTextColor={colors.slate500}
              secureTextEntry
              style={s.input}
            />
          </View>
        </View>

        <TouchableOpacity
          onPress={handleLogin}
          disabled={isDisabled}
          style={[
            s.submitBtn,
            isDisabled && base.btnDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={[base.textWhite, { fontSize: 15 }]}>
              {t("login.submit")}
            </Text>
          )}
        </TouchableOpacity>

        <View style={s.footer}>
          <Text style={base.textSm}>
            {t("login.noAccount")}{" "}
          </Text>
          <Link href="/(auth)/register" asChild>
            <TouchableOpacity>
              <Text style={s.linkText}>
                {t("login.register")}
              </Text>
            </TouchableOpacity>
          </Link>
        </View>

        {/* Server URL config */}
        <TouchableOpacity
          onPress={() => setShowServerConfig(!showServerConfig)}
          style={s.serverToggle}
        >
          <Text style={s.serverToggleText}>
            {t("settings.serverUrl")}
          </Text>
        </TouchableOpacity>

        {showServerConfig && (
          <View style={s.serverConfig}>
            <TextInput
              value={serverUrl}
              onChangeText={(text) => {
                setServerUrl(text);
                setServerSaved(false);
              }}
              placeholder="https://your-server.com"
              placeholderTextColor={colors.slate500}
              autoCapitalize="none"
              autoCorrect={false}
              style={s.input}
            />
            <TouchableOpacity
              onPress={async () => {
                await setApiBaseUrl(serverUrl.trim());
                setServerSaved(true);
              }}
              style={s.serverSaveBtn}
            >
              <Text style={s.serverSaveBtnText}>
                {serverSaved ? t("settings.saved") : t("common.save")}
              </Text>
            </TouchableOpacity>
            {serverSaved && (
              <Text style={s.serverHint}>{t("settings.saved")}</Text>
            )}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 32,
    },
    subtitle: {
      fontSize: 17,
      color: colors.muted,
    },
    fieldGroup: {
      gap: 0,
    },
    label: {
      fontSize: 13,
      color: colors.muted,
      marginBottom: 6,
    },
    input: {
      backgroundColor: "rgba(0,0,0,0.3)",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 15,
    },
    submitBtn: {
      backgroundColor: "rgba(20,184,166,0.25)",
      borderWidth: 1,
      borderColor: "rgba(20,184,166,0.4)",
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 8,
    },
    footer: {
      flexDirection: "row",
      justifyContent: "center",
      marginTop: 24,
    },
    linkText: {
      color: colors.teal,
      fontSize: 13,
      fontWeight: "600",
    },
    serverToggle: {
      alignItems: "center",
      marginTop: 32,
    },
    serverToggleText: {
      color: colors.slate500,
      fontSize: 11,
      textDecorationLine: "underline",
    },
    serverConfig: {
      marginTop: 12,
      gap: 8,
    },
    serverSaveBtn: {
      backgroundColor: "rgba(20,184,166,0.25)",
      borderWidth: 1,
      borderColor: "rgba(20,184,166,0.4)",
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: "center",
    },
    serverSaveBtnText: {
      color: colors.white,
      fontSize: 13,
      fontWeight: "600",
    },
    serverHint: {
      color: colors.muted,
      fontSize: 11,
      textAlign: "center",
    },
  });
}
