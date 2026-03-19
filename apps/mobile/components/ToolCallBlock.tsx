import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import { colors, base } from "../lib/theme";

interface Props {
  toolName: string;
  toolInput?: any;
  result?: string;
  pending?: boolean;
}

export default function ToolCallBlock({
  toolName,
  toolInput,
  result,
  pending,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();
  const label = t(`tool.${toolName}`, toolName);

  let parsedResult: any = null;
  if (result) {
    try {
      parsedResult = JSON.parse(result);
    } catch {
      parsedResult = result;
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        style={styles.header}
      >
        {pending ? (
          <ActivityIndicator size="small" color={colors.teal} />
        ) : (
          <Text style={styles.checkmark}>✓</Text>
        )}
        <Text style={[styles.label, base.flex1]}>{label}</Text>
        <Text style={styles.toolName}>{toolName}</Text>
        <Text
          style={[
            styles.arrow,
            expanded && { transform: [{ rotate: "90deg" }] },
          ]}
        >
          ▶
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.expandedBody}>
          {toolInput && (
            <View style={base.mb2}>
              <Text style={styles.sectionLabel}>{t("chat.parameters")}</Text>
              <View style={styles.codeBlock}>
                <Text style={styles.codeText}>
                  {JSON.stringify(toolInput, null, 2)}
                </Text>
              </View>
            </View>
          )}
          {parsedResult !== null && (
            <View>
              <Text style={styles.sectionLabel}>{t("chat.results")}</Text>
              <View style={[styles.codeBlock, { maxHeight: 160 }]}>
                <Text style={styles.codeText}>
                  {typeof parsedResult === "string"
                    ? parsedResult
                    : JSON.stringify(parsedResult, null, 2)}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    overflow: "hidden",
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  checkmark: {
    color: colors.emerald,
    fontSize: 11,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "500",
  },
  toolName: {
    color: colors.slate600,
    fontSize: 11,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  arrow: {
    color: colors.muted,
    fontSize: 11,
  },
  expandedBody: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sectionLabel: {
    fontSize: 10,
    color: colors.slate500,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  codeBlock: {
    backgroundColor: colors.card,
    borderRadius: 4,
    padding: 8,
  },
  codeText: {
    fontSize: 11,
    color: colors.muted,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
});
