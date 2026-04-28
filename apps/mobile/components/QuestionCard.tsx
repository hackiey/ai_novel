import { useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
import { getTokenSync } from "../lib/auth";
import { getApiBaseUrlSync } from "../lib/config";

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionInfo {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
}

interface Props {
  callId: string;
  sessionId: string;
  questions: QuestionInfo[];
  /** True while the agent is still blocked on this tool call. */
  pending: boolean;
}

export default function QuestionCard({ callId, sessionId, questions, pending }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const initial = useMemo(() => questions.map(() => new Set<string>()), [questions]);
  const [selections, setSelections] = useState<Set<string>[]>(initial);
  const [submitting, setSubmitting] = useState<"reply" | "reject" | null>(null);
  const [submitted, setSubmitted] = useState<"replied" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const interactive = pending && !submitted;
  const allAnswered = selections.every((s) => s.size > 0);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const toggle = (qIdx: number, label: string, multi: boolean) => {
    setSelections((prev) => {
      const next = prev.map((s) => new Set(s));
      const cur = next[qIdx];
      if (multi) {
        if (cur.has(label)) cur.delete(label); else cur.add(label);
      } else {
        next[qIdx] = cur.has(label) ? new Set() : new Set([label]);
      }
      return next;
    });
  };

  const post = async (path: string, body: unknown) => {
    const token = getTokenSync();
    const baseUrl = getApiBaseUrlSync();
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  };

  const handleSubmit = async () => {
    if (!interactive || !allAnswered) return;
    setSubmitting("reply");
    setError(null);
    try {
      const answers: string[][] = selections.map((s) => Array.from(s));
      const res = await post(`/api/agent/question/${encodeURIComponent(callId)}/reply`, {
        sessionId,
        answers,
      });
      if (!res.ok) {
        const body: any = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setSubmitted("replied");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(null);
    }
  };

  const handleReject = async () => {
    if (!interactive) return;
    setSubmitting("reject");
    setError(null);
    try {
      const res = await post(`/api/agent/question/${encodeURIComponent(callId)}/reject`, {
        sessionId,
      });
      if (!res.ok) {
        const body: any = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setSubmitted("rejected");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <View style={styles.card}>
      {questions.map((q, qIdx) => {
        const multi = !!q.multiple;
        const selected = selections[qIdx];
        return (
          <View key={qIdx} style={styles.questionBlock}>
            {!!q.header && (
              <View style={styles.headerChipWrap}>
                <Text style={styles.headerChip}>{q.header}</Text>
              </View>
            )}
            <Text style={styles.questionText}>{q.question}</Text>
            <View style={styles.optionList}>
              {q.options.map((opt, oIdx) => {
                const isSelected = selected.has(opt.label);
                return (
                  <TouchableOpacity
                    key={oIdx}
                    disabled={!interactive}
                    onPress={() => toggle(qIdx, opt.label, multi)}
                    style={[
                      styles.option,
                      isSelected ? styles.optionSelected : styles.optionUnselected,
                      !interactive && { opacity: 0.6 },
                    ]}
                  >
                    <View style={[
                      multi ? styles.checkbox : styles.radio,
                      isSelected && styles.indicatorSelected,
                    ]}>
                      {isSelected && (multi
                        ? <Text style={styles.checkMark}>✓</Text>
                        : <View style={styles.radioDot} />)
                      }
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionLabel}>{opt.label}</Text>
                      {!!opt.description && (
                        <Text style={styles.optionDesc}>{opt.description}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.actions}>
        {!submitted && (
          <>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!interactive || !allAnswered || submitting !== null}
              style={[
                styles.submitBtn,
                (!interactive || !allAnswered) && styles.submitBtnDisabled,
              ]}
            >
              {submitting === "reply"
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.submitBtnText}>{t("question.submit", "提交")}</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleReject}
              disabled={!interactive || submitting !== null}
              style={[styles.skipBtn, !interactive && { opacity: 0.5 }]}
            >
              {submitting === "reject"
                ? <ActivityIndicator size="small" color={colors.muted} />
                : <Text style={styles.skipBtnText}>{t("question.skip", "跳过")}</Text>}
            </TouchableOpacity>
          </>
        )}
        {submitted === "replied" && (
          <Text style={styles.statusReplied}>✓ {t("question.replied", "已回答")}</Text>
        )}
        {submitted === "rejected" && (
          <Text style={styles.statusSkipped}>× {t("question.rejected", "已跳过")}</Text>
        )}
        {!interactive && !submitted && (
          <Text style={styles.statusExpired}>{t("question.expired", "问题已结束")}</Text>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    card: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.teal,
      backgroundColor: colors.card,
      padding: 12,
      gap: 12,
      marginBottom: 4,
    },
    questionBlock: { gap: 8 },
    headerChipWrap: { flexDirection: "row" },
    headerChip: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: colors.bg,
      color: colors.teal,
      fontSize: 10,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 1,
      overflow: "hidden",
    },
    questionText: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.text,
    },
    optionList: { gap: 6 },
    option: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
    },
    optionUnselected: {
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    optionSelected: {
      borderColor: colors.teal,
      backgroundColor: colors.card,
    },
    radio: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    checkbox: {
      width: 16,
      height: 16,
      borderRadius: 3,
      borderWidth: 1,
      borderColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    indicatorSelected: {
      borderColor: colors.teal,
    },
    radioDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.teal,
    },
    checkMark: {
      color: colors.teal,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 14,
    },
    optionLabel: {
      fontSize: 13,
      color: colors.text,
      fontWeight: "500",
    },
    optionDesc: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    submitBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 6,
      backgroundColor: colors.teal,
    },
    submitBtnDisabled: {
      backgroundColor: colors.border,
    },
    submitBtnText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "600",
    },
    skipBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 6,
    },
    skipBtnText: {
      color: colors.muted,
      fontSize: 12,
    },
    statusReplied: {
      color: colors.teal,
      fontSize: 12,
    },
    statusSkipped: {
      color: colors.muted,
      fontSize: 12,
    },
    statusExpired: {
      color: colors.muted,
      fontSize: 12,
    },
    error: {
      color: "#dc2626",
      fontSize: 11,
    },
  });
}
