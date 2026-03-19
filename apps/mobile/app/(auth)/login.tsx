import { useState } from "react";
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
import { useTranslation } from "react-i18next";
import { colors, base } from "../../lib/theme";

export default function LoginScreen() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const isDisabled = loading || !email.trim() || !password;

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      Alert.alert(t("login.failed"), err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

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
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
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
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  submitBtn: {
    backgroundColor: colors.teal,
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
