import { useState, useMemo } from "react";
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

export default function RegisterScreen() {
  const { register } = useAuth();
  const { colors, baseStyles: base } = useTheme();
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const isDisabled =
    loading || !email.trim() || !password || !displayName.trim();

  async function handleRegister() {
    if (!email.trim() || !password || !displayName.trim()) return;
    setLoading(true);
    try {
      await register(email.trim(), password, displayName.trim());
    } catch (err: any) {
      Alert.alert(t("register.failed"), err.message || "Unknown error");
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
          AI Creator
        </Text>
        <Text style={[s.subtitle, base.textCenter, { marginBottom: 40 }]}>
          {t("register.title")}
        </Text>

        <View style={[s.fieldGroup, base.mb6]}>
          <View>
            <Text style={[s.label, base.mb1]}>
              {t("register.displayName")}
            </Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder={t("register.displayName")}
              placeholderTextColor={colors.slate500}
              autoCorrect={false}
              style={s.input}
            />
          </View>

          <View style={base.mt4}>
            <Text style={[s.label, base.mb1]}>
              {t("register.email")}
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t("register.email")}
              placeholderTextColor={colors.slate500}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={s.input}
            />
          </View>

          <View style={base.mt4}>
            <Text style={[s.label, base.mb1]}>
              {t("register.password")}
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t("register.password")}
              placeholderTextColor={colors.slate500}
              secureTextEntry
              style={s.input}
            />
          </View>
        </View>

        <TouchableOpacity
          onPress={handleRegister}
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
              {t("register.submit")}
            </Text>
          )}
        </TouchableOpacity>

        <View style={s.footer}>
          <Text style={base.textSm}>
            {t("register.hasAccount")}{" "}
          </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={s.linkText}>
                {t("register.login")}
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
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
  });
}
