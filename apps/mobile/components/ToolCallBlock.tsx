import { useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";

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
  const { colors, baseStyles: base } = useTheme();
  const label = t(`tool.${toolName}`, toolName);

  let parsedResult: any = null;
  if (result) {
    try {
      parsedResult = JSON.parse(result);
    } catch {
      parsedResult = result;
    }
  }

  const s = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={s.container}>
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        style={s.header}
      >
        {pending ? (
          <ActivityIndicator size="small" color={colors.teal} />
        ) : (
          <Text style={s.checkmark}>✓</Text>
        )}
        <Text style={s.label} numberOfLines={1}>{label}</Text>
        <Text style={s.toolName} numberOfLines={1}>{toolName}</Text>
        <Text
          style={[
            s.arrow,
            expanded && { transform: [{ rotate: "90deg" }] },
          ]}
        >
          ▶
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View style={s.expandedBody}>
          {toolInput && (
            <View style={base.mb2}>
              <Text style={s.sectionLabel}>{t("chat.parameters")}</Text>
              <View style={s.codeBlock}>
                <Text style={s.codeText}>
                  {JSON.stringify(toolInput, null, 2)}
                </Text>
              </View>
            </View>
          )}
          {parsedResult !== null && (
            <View>
              <Text style={s.sectionLabel}>{t("chat.results")}</Text>
              <View style={[s.codeBlock, { maxHeight: 160 }]}>
                <Text style={s.codeText}>
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

function createStyles(colors: any) {
  return StyleSheet.create({
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
      flex: 1,
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
}
