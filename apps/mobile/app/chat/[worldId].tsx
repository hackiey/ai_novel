import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import Markdown from "react-native-markdown-display";
import { useAgentChat } from "../../lib/useAgentChat";
import { buildSegments, type ChatMessage } from "../../lib/segments";
import ToolCallBlock from "../../components/ToolCallBlock";
import { colors, base } from "../../lib/theme";

const markdownStyles = {
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  paragraph: { marginTop: 0, marginBottom: 8 },
  code_inline: {
    backgroundColor: colors.border,
    color: colors.text,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    fontSize: 13,
  },
  fence: {
    backgroundColor: colors.card,
    color: colors.text,
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
  },
  heading1: { color: colors.text, fontSize: 20, fontWeight: "700" as const },
  heading2: { color: colors.text, fontSize: 18, fontWeight: "700" as const },
  heading3: { color: colors.text, fontSize: 16, fontWeight: "600" as const },
  list_item: { color: colors.text },
  bullet_list: { color: colors.text },
  ordered_list: { color: colors.text },
  blockquote: {
    borderLeftColor: colors.slate600,
    borderLeftWidth: 3,
    paddingLeft: 12,
    backgroundColor: colors.card,
    borderRadius: 4,
  },
  strong: { color: colors.text, fontWeight: "700" as const },
  em: { color: "#cbd5e1", fontStyle: "italic" as const },
  link: { color: colors.teal },
};

function AssistantMessageContent({
  events,
  content,
  isStreaming,
}: {
  events?: any[];
  content: string;
  isStreaming: boolean;
}) {
  const { t } = useTranslation();
  const segments = buildSegments(events, content, isStreaming);

  if (segments.length === 0 && isStreaming) {
    return (
      <View style={styles.thinkingRow}>
        <ActivityIndicator size="small" color={colors.teal} />
        <Text style={styles.thinkingText}>{t("chat.thinking")}</Text>
      </View>
    );
  }

  return (
    <View>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return (
            <View key={i} style={styles.textBubble}>
              <Markdown style={markdownStyles}>{seg.content}</Markdown>
            </View>
          );
        }
        return (
          <View key={i} style={styles.toolBlockWrap}>
            {seg.calls.map((call, j) => (
              <ToolCallBlock key={j} {...call} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

export default function ChatScreen() {
  const { worldId } = useLocalSearchParams<{ worldId: string }>();
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const {
    messages,
    sendMessage,
    isLoading,
    sessionId,
    sessionsQuery,
    loadSession,
    newSession,
  } = useAgentChat(worldId!);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    sendMessage(text);
  }

  function renderMessage({
    item,
    index,
  }: {
    item: ChatMessage;
    index: number;
  }) {
    if (item.role === "user") {
      return (
        <View style={styles.userRow}>
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{item.content}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.assistantRow}>
        <AssistantMessageContent
          events={item.events}
          content={item.content}
          isStreaming={isLoading && index === messages.length - 1}
        />
      </View>
    );
  }

  const suggestions = [
    t("chat.suggestion.listCharacters"),
    t("chat.suggestion.continueWriting"),
    t("chat.suggestion.plotTwist"),
  ];


  return (
    <View style={[base.flex1, base.bgDark]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("chat.aiAssistant"),
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerRight: () => (
            <View style={styles.headerRight}>
              <TouchableOpacity
                onPress={() => setShowHistory(true)}
                style={styles.headerBtnOutline}
              >
                <Text style={styles.headerBtnOutlineText}>
                  {t("chat.history")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={newSession}
                style={styles.headerBtnPrimary}
              >
                <Text style={styles.headerBtnPrimaryText}>
                  + {t("chat.newChat")}
                </Text>
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={base.flex1}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>{t("chat.emptyTitle")}</Text>
              <Text style={styles.emptySubtitle}>
                {t("chat.emptySubtitle")}
              </Text>
              <View style={styles.suggestionsWrap}>
                {suggestions.map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setInput(s)}
                    style={styles.suggestionChip}
                  >
                    <Text style={styles.suggestionText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.emptySubtitle, { marginTop: 8 }]}>
                {t("chat.memoryHint")}
              </Text>
            </View>
          }
        />

        {/* Input */}
        <View style={styles.inputBar}>
          <View style={styles.inputRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={t("chat.inputPlaceholder")}
              placeholderTextColor={colors.slate500}
              multiline
              style={styles.textInput}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={isLoading || !input.trim()}
              style={[
                styles.sendBtn,
                (isLoading || !input.trim()) && styles.sendBtnDisabled,
              ]}
            >
              <Text style={styles.sendBtnText}>{t("chat.send")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* History Modal */}
      <Modal visible={showHistory} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("chat.history")}</Text>
              <TouchableOpacity onPress={() => setShowHistory(false)}>
                <Text style={styles.modalCloseText}>{t("chat.close")}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={base.px4}>
              {sessionsQuery.isLoading && (
                <View style={styles.modalLoading}>
                  <ActivityIndicator color={colors.teal} />
                </View>
              )}
              {sessionsQuery.data?.length === 0 && (
                <View style={styles.modalLoading}>
                  <Text style={styles.noHistoryText}>
                    {t("chat.noHistory")}
                  </Text>
                </View>
              )}
              {sessionsQuery.data?.map((s: any) => (
                <TouchableOpacity
                  key={s.sessionId}
                  onPress={() => {
                    setShowHistory(false);
                    loadSession(s.sessionId);
                  }}
                  style={[
                    styles.sessionItem,
                    sessionId === s.sessionId && styles.sessionItemActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.sessionTitle,
                      sessionId === s.sessionId && styles.sessionTitleActive,
                    ]}
                    numberOfLines={1}
                  >
                    {s.title || t("chat.untitled")}
                  </Text>
                  <Text style={styles.sessionDate}>
                    {s.updatedAt
                      ? new Date(s.updatedAt).toLocaleString("zh-CN")
                      : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // AssistantMessageContent
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  thinkingText: {
    color: colors.teal,
    fontSize: 11,
  },
  textBubble: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    maxWidth: "90%",
  },
  toolBlockWrap: {
    maxWidth: "90%",
    marginBottom: 8,
  },

  // Message rows
  userRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  userBubble: {
    backgroundColor: colors.tealDark,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: "80%",
  },
  userText: {
    color: colors.white,
    fontSize: 13,
  },
  assistantRow: {
    marginBottom: 12,
    paddingHorizontal: 16,
  },

  // Header
  headerRight: {
    flexDirection: "row",
    gap: 8,
    marginRight: 8,
  },
  headerBtnOutline: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerBtnOutlineText: {
    color: colors.muted,
    fontSize: 11,
  },
  headerBtnPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.tealDark,
  },
  headerBtnPrimaryText: {
    color: colors.white,
    fontSize: 11,
  },

  // List
  listContent: {
    paddingVertical: 16,
    flexGrow: 1,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  suggestionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionText: {
    color: colors.muted,
    fontSize: 11,
  },

  // Input bar
  inputBar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end",
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 13,
    maxHeight: 120,
    minHeight: 40,
  },
  sendBtn: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.tealDark,
  },
  sendBtnDisabled: {
    backgroundColor: colors.tealDark,
    opacity: 0.5,
  },
  sendBtnText: {
    color: colors.white,
    fontWeight: "600",
    fontSize: 13,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.black50,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    maxHeight: "60%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  modalCloseText: {
    color: colors.muted,
    fontSize: 13,
  },
  modalLoading: {
    paddingVertical: 32,
    alignItems: "center",
  },
  noHistoryText: {
    fontSize: 13,
    color: colors.muted,
  },
  sessionItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sessionItemActive: {
    backgroundColor: colors.bg,
  },
  sessionTitle: {
    fontSize: 13,
    color: colors.muted,
  },
  sessionTitleActive: {
    color: colors.text,
    fontWeight: "600",
  },
  sessionDate: {
    fontSize: 11,
    color: colors.slate600,
    marginTop: 2,
  },
});
