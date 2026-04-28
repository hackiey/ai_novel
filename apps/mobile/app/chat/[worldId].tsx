import { useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, Stack } from "expo-router";
import { BookOpen, History, Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import Markdown from "react-native-markdown-display";
import { useAgentChat } from "../../lib/useAgentChat";
import { buildSegments, type ChatMessage } from "../../lib/segments";
import ToolCallBlock from "../../components/ToolCallBlock";
import QuestionCard, { type QuestionInfo } from "../../components/QuestionCard";
import { getMarkdownStyles } from "../../lib/markdownStyles";
import { trpc } from "../../lib/trpc";
import { useTheme } from "../../contexts/ThemeContext";
import ThemeBackground from "../../components/backgrounds/ThemeBackground";

function formatModelName(model: string) {
  const parts = model.split(":");
  const id = parts.length > 1 ? parts[1] : parts[0];
  return id
    .replace(/^(claude-|gpt-|gemini-)/, "")
    .replace(/-\d{8}$/, "");
}

function formatTokenK(value: number | undefined) {
  if (!value || value <= 0) return "0k";
  const scaled = value / 1000;
  const formatted = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
  return `${formatted.replace(/\.0$/, "")}k`;
}

function AssistantMessageContent({
  events,
  content,
  isStreaming,
  chatStyles,
  mdStyles,
  tealColor,
  sessionId,
}: {
  events?: any[];
  content: string;
  isStreaming: boolean;
  chatStyles: ReturnType<typeof createStyles>;
  mdStyles: ReturnType<typeof getMarkdownStyles>;
  tealColor: string;
  sessionId?: string;
}) {
  const { t } = useTranslation();
  const segments = buildSegments(events, content, isStreaming);

  const lastSeg = segments[segments.length - 1];
  const showThinking = isStreaming && (
    segments.length === 0 ||
    (lastSeg?.type === "tools" && lastSeg.calls.every((c: any) => !c.pending))
  );

  if (segments.length === 0 && showThinking) {
    return (
      <View style={chatStyles.thinkingRow}>
        <ActivityIndicator size="small" color={tealColor} />
        <Text style={chatStyles.thinkingText}>{t("chat.thinking")}</Text>
      </View>
    );
  }

  return (
    <View>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return (
            <View key={i} style={chatStyles.textBubble}>
              <Markdown style={mdStyles}>{seg.content}</Markdown>
            </View>
          );
        }

        if (seg.type === "status") {
          return (
            <View key={i} style={chatStyles.statusBubble}>
              <Text style={chatStyles.statusText}>{seg.content}</Text>
            </View>
          );
        }

        return (
          <View key={i} style={chatStyles.toolBlockWrap}>
            {seg.calls.map((call: any, j: number) => {
              if (call.toolName === "question" && call.toolCallId && sessionId) {
                const questions: QuestionInfo[] = Array.isArray(call.toolInput?.questions)
                  ? call.toolInput.questions
                  : [];
                if (questions.length > 0) {
                  return (
                    <QuestionCard
                      key={j}
                      callId={call.toolCallId}
                      sessionId={sessionId}
                      questions={questions}
                      pending={!!call.pending}
                    />
                  );
                }
              }
              return <ToolCallBlock key={j} {...call} />;
            })}
          </View>
        );
      })}
      {showThinking && segments.length > 0 && (
        <View style={chatStyles.thinkingRow}>
          <ActivityIndicator size="small" color={tealColor} />
          <Text style={chatStyles.thinkingText}>{t("chat.thinking")}</Text>
        </View>
      )}
    </View>
  );
}

export default function ChatScreen() {
  const { worldId } = useLocalSearchParams<{ worldId: string }>();
  const { t, i18n } = useTranslation();
  const { colors, baseStyles: base, fontFamily, themeVariant } = useTheme();
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [memorySubTab, setMemorySubTab] = useState<"world" | "project">("world");
  const [worldMemoryDraft, setWorldMemoryDraft] = useState("");
  const [projectMemoryDraft, setProjectMemoryDraft] = useState("");
  const [memorySaveStatus, setMemorySaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  const {
    messages,
    sendMessage,
    isLoading,
    sessionId,
    sessionsQuery,
    loadSession,
    newSession,
    modelsQuery,
    selectedModel,
    setSelectedModel,
    truncateAndResend,
  } = useAgentChat(worldId!);

  // Memory queries
  const memoryQuery = trpc.agent.getMemory.useQuery(
    { worldId: worldId! },
    { enabled: !!worldId && showMemory }
  );
  const updateMemoryMut = trpc.agent.updateMemory.useMutation();

  useEffect(() => {
    if (memoryQuery.data) {
      setWorldMemoryDraft(memoryQuery.data.worldMemory || "");
      setProjectMemoryDraft(memoryQuery.data.projectMemory || "");
    }
  }, [memoryQuery.data]);

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

  async function handleSaveMemory() {
    setMemorySaveStatus("saving");
    try {
      if (memorySubTab === "world") {
        await updateMemoryMut.mutateAsync({
          scope: "world",
          worldId: worldId!,
          content: worldMemoryDraft,
        });
      } else {
        await updateMemoryMut.mutateAsync({
          scope: "project",
          projectId: worldId!,
          content: projectMemoryDraft,
        });
      }
      setMemorySaveStatus("saved");
      setTimeout(() => setMemorySaveStatus("idle"), 2000);
    } catch {
      setMemorySaveStatus("idle");
    }
  }

  function handleLongPressUser(index: number) {
    Alert.alert(
      t("chat.editTooltip"),
      undefined,
      [
        {
          text: t("chat.edit"),
          onPress: () => {
            setEditingIndex(index);
            setEditText(messages[index].content);
          },
        },
        {
          text: t("chat.retry"),
          onPress: () => {
            truncateAndResend(index, messages[index].content);
          },
        },
        { text: t("chat.cancel"), style: "cancel" },
      ]
    );
  }

  function handleEditSend() {
    if (editingIndex === null || !editText.trim()) return;
    const idx = editingIndex;
    setEditingIndex(null);
    truncateAndResend(idx, editText.trim());
    setEditText("");
  }

  const models = modelsQuery.data?.available ?? [];
  const defaultModel = modelsQuery.data?.default;
  const activeSession = sessionsQuery.data?.find((session: any) => session.sessionId === sessionId) as any;
  const currentModel = selectedModel || activeSession?.model || defaultModel || "";
  const currentContextTokens = activeSession?.usage?.maxContextTokens ?? activeSession?.usage?.lastContextTokens ?? 0;
  const currentModelContextWindow = activeSession?.usage?.modelContextWindow
    ?? (currentModel ? modelsQuery.data?.contextWindows?.[currentModel] : undefined)
    ?? 0;
  const tokenLabel = i18n.language.startsWith("zh") ? "当前上下文" : "Context";

  const s = useMemo(() => createStyles(colors), [colors]);
  const mdStyles = useMemo(() => getMarkdownStyles(colors, fontFamily), [colors, fontFamily]);

  function renderMessage({
    item,
    index,
  }: {
    item: ChatMessage;
    index: number;
  }) {
    if (item.role === "user") {
      if (editingIndex === index) {
        return (
          <View style={s.userRow}>
            <View style={s.editBubble}>
              <TextInput
                value={editText}
                onChangeText={setEditText}
                multiline
                autoFocus
                style={s.editInput}
              />
              <View style={s.editActions}>
                <TouchableOpacity
                  onPress={() => {
                    setEditingIndex(null);
                    setEditText("");
                  }}
                  style={s.editCancelBtn}
                >
                  <Text style={s.editCancelText}>{t("chat.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleEditSend}
                  disabled={!editText.trim()}
                  style={[
                    s.editSendBtn,
                    !editText.trim() && s.sendBtnDisabled,
                  ]}
                >
                  <Text style={s.sendBtnText}>{t("chat.saveAndSend")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      }
      return (
        <View style={s.userRow}>
          <TouchableOpacity
            onLongPress={() => handleLongPressUser(index)}
            style={s.userBubble}
          >
            <Text style={[s.userText, fontFamily ? { fontFamily } : undefined]}>
              {item.content}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={s.assistantRow}>
        <AssistantMessageContent
          events={item.events}
          content={item.content}
          isStreaming={isLoading && index === messages.length - 1}
          chatStyles={s}
          mdStyles={mdStyles}
          tealColor={colors.teal}
          sessionId={sessionId}
        />
      </View>
    );
  }

  const suggestions = [
    t("chat.suggestion.listCharacters"),
    t("chat.suggestion.plotTwist"),
  ];

  return (
    <View style={[base.flex1, base.bgDark]}>
      <ThemeBackground theme={themeVariant} bgColor={colors.bg} />
      <Stack.Screen
        options={{
          title: t("chat.aiAssistant"),
          headerRight: () => (
            <View style={s.headerRight}>
              <TouchableOpacity
                onPress={() => setShowMemory(true)}
                style={s.headerIconBtn}
              >
                <BookOpen size={18} color={colors.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowHistory(true)}
                style={s.headerIconBtn}
              >
                <History size={18} color={colors.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={newSession}
                style={s.headerIconBtn}
              >
                <Plus size={18} color={colors.teal} />
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
        {/* Model selector bar */}
        <TouchableOpacity
          onPress={() => setShowModelPicker(true)}
          style={s.modelBar}
        >
          <Text style={s.modelBarLabel}>{t("chat.model")}: </Text>
          <Text style={s.modelBarValue}>
            {currentModel ? formatModelName(currentModel) : "..."}
          </Text>
        </TouchableOpacity>

        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={s.listContent}
          ListEmptyComponent={
            <View style={s.emptyContainer}>
              <Text style={s.emptyTitle}>{t("chat.emptyTitle")}</Text>
              <Text style={s.emptySubtitle}>
                {t("chat.emptySubtitle")}
              </Text>
              <View style={s.suggestionsWrap}>
                {suggestions.map((sug) => (
                  <TouchableOpacity
                    key={sug}
                    onPress={() => setInput(sug)}
                    style={s.suggestionChip}
                  >
                    <Text style={s.suggestionText}>{sug}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[s.emptySubtitle, { marginTop: 8 }]}>
                {t("chat.memoryHint")}
              </Text>
            </View>
          }
        />

        {/* Input */}
        <View style={[s.inputBar, { paddingBottom: 12 + insets.bottom }]}> 
          <View style={s.inputRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={t("chat.inputPlaceholder")}
              placeholderTextColor={colors.slate500}
              multiline
              style={s.textInput}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={isLoading || !input.trim()}
              style={[
                s.sendBtn,
                (isLoading || !input.trim()) && s.sendBtnDisabled,
              ]}
            >
              <Text style={s.sendBtnText}>{t("chat.send")}</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.inputStatsText}>
            {tokenLabel} {formatTokenK(currentContextTokens)} / {currentModelContextWindow > 0 ? formatTokenK(currentModelContextWindow) : "--"}
          </Text>
        </View>
      </KeyboardAvoidingView>

      {/* Model Picker Modal */}
      <Modal visible={showModelPicker} transparent animationType="slide">
        <Pressable style={s.modalOverlay} onPress={() => setShowModelPicker(false)}>
          <Pressable style={s.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t("chat.selectModel")}</Text>
              <TouchableOpacity onPress={() => setShowModelPicker(false)}>
                <Text style={s.modalCloseText}>{t("chat.close")}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={base.px4}>
              {modelsQuery.isLoading && (
                <View style={s.modalLoading}>
                  <ActivityIndicator color={colors.teal} />
                </View>
              )}
              {models.map((m: string) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => {
                    setSelectedModel(m);
                    setShowModelPicker(false);
                  }}
                  style={[
                    s.sessionItem,
                    currentModel === m && s.sessionItemActive,
                  ]}
                >
                  <Text
                    style={[
                      s.sessionTitle,
                      currentModel === m && s.sessionTitleActive,
                    ]}
                  >
                    {formatModelName(m)}
                  </Text>
                  <Text style={s.sessionDate}>{m}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Memory Editor Modal */}
      <Modal visible={showMemory} transparent animationType="slide">
        <Pressable style={s.modalOverlay} onPress={() => setShowMemory(false)}>
          <Pressable style={[s.modalContent, { maxHeight: "80%" }]} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t("chat.memory")}</Text>
              <TouchableOpacity onPress={() => setShowMemory(false)}>
                <Text style={s.modalCloseText}>{t("chat.close")}</Text>
              </TouchableOpacity>
            </View>
            {/* Sub-tabs */}
            <View style={s.memoryTabBar}>
              <TouchableOpacity
                onPress={() => setMemorySubTab("world")}
                style={[
                  s.memoryTab,
                  memorySubTab === "world" && s.memoryTabActive,
                ]}
              >
                <Text
                  style={[
                    s.memoryTabText,
                    memorySubTab === "world" && s.memoryTabTextActive,
                  ]}
                >
                  {t("chat.memoryWorld")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMemorySubTab("project")}
                style={[
                  s.memoryTab,
                  memorySubTab === "project" && s.memoryTabActive,
                ]}
              >
                <Text
                  style={[
                    s.memoryTabText,
                    memorySubTab === "project" && s.memoryTabTextActive,
                  ]}
                >
                  {t("chat.memoryProject")}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={s.memoryBody}>
              {memoryQuery.isLoading ? (
                <View style={s.modalLoading}>
                  <ActivityIndicator color={colors.teal} />
                </View>
              ) : (
                <>
                  <TextInput
                    value={memorySubTab === "world" ? worldMemoryDraft : projectMemoryDraft}
                    onChangeText={memorySubTab === "world" ? setWorldMemoryDraft : setProjectMemoryDraft}
                    placeholder={t("chat.memoryEmpty")}
                    placeholderTextColor={colors.slate500}
                    multiline
                    style={s.memoryInput}
                  />
                  <TouchableOpacity
                    onPress={handleSaveMemory}
                    disabled={memorySaveStatus === "saving"}
                    style={[
                      s.memorySaveBtn,
                      memorySaveStatus === "saving" && base.btnDisabled,
                    ]}
                  >
                    <Text style={s.memorySaveBtnText}>
                      {memorySaveStatus === "saving"
                        ? t("chat.memorySaving")
                        : memorySaveStatus === "saved"
                          ? t("chat.memorySaved")
                          : t("chat.memorySave")}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* History Modal */}
      <Modal visible={showHistory} transparent animationType="slide">
        <Pressable style={s.modalOverlay} onPress={() => setShowHistory(false)}>
          <Pressable style={s.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{t("chat.history")}</Text>
              <TouchableOpacity onPress={() => setShowHistory(false)}>
                <Text style={s.modalCloseText}>{t("chat.close")}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={base.px4}>
              {sessionsQuery.isLoading && (
                <View style={s.modalLoading}>
                  <ActivityIndicator color={colors.teal} />
                </View>
              )}
              {sessionsQuery.data?.length === 0 && (
                <View style={s.modalLoading}>
                  <Text style={s.noHistoryText}>
                    {t("chat.noHistory")}
                  </Text>
                </View>
              )}
              {sessionsQuery.data?.map((sess: any) => (
                <TouchableOpacity
                  key={sess.sessionId}
                  onPress={() => {
                    setShowHistory(false);
                    loadSession(sess.sessionId);
                  }}
                  style={[
                    s.sessionItem,
                    sessionId === sess.sessionId && s.sessionItemActive,
                  ]}
                >
                  <Text
                    style={[
                      s.sessionTitle,
                      sessionId === sess.sessionId && s.sessionTitleActive,
                    ]}
                    numberOfLines={1}
                  >
                    {sess.title || t("chat.untitled")}
                  </Text>
                  <Text style={s.sessionDate}>
                    {sess.updatedAt
                      ? new Date(sess.updatedAt).toLocaleString("zh-CN")
                      : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
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
    statusBubble: {
      backgroundColor: "rgba(245, 158, 11, 0.12)",
      borderWidth: 1,
      borderColor: "rgba(245, 158, 11, 0.28)",
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
      maxWidth: "90%",
    },
    statusText: {
      color: colors.text,
      fontSize: 12,
      lineHeight: 18,
    },
    toolBlockWrap: {
      maxWidth: "90%",
      marginBottom: 8,
    },
    inputStatsText: {
      color: colors.slate400,
      fontSize: 11,
      marginTop: 6,
      paddingHorizontal: 4,
    },

    // Message rows
    userRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 12,
      paddingHorizontal: 16,
    },
    userBubble: {
      backgroundColor: "rgba(20,184,166,0.15)",
      borderWidth: 1,
      borderColor: "rgba(20,184,166,0.3)",
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

    // Edit mode
    editBubble: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.teal,
      borderRadius: 16,
      padding: 12,
      maxWidth: "85%",
      width: "85%",
    },
    editInput: {
      color: colors.text,
      fontSize: 13,
      minHeight: 60,
      textAlignVertical: "top",
    },
    editActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 8,
    },
    editCancelBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    editCancelText: {
      color: colors.muted,
      fontSize: 11,
    },
    editSendBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: "rgba(20,184,166,0.25)",
      borderWidth: 1,
      borderColor: "rgba(20,184,166,0.4)",
    },

    // Header
    headerRight: {
      flexDirection: "row",
      gap: 12,
      marginRight: 8,
    },
    headerIconBtn: {
      padding: 6,
    },

    // Model bar
    modelBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modelBarLabel: {
      color: colors.muted,
      fontSize: 11,
    },
    modelBarValue: {
      color: colors.teal,
      fontSize: 11,
      fontWeight: "600",
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
      backgroundColor: "rgba(20,184,166,0.25)",
      borderWidth: 1,
      borderColor: "rgba(20,184,166,0.4)",
    },
    sendBtnDisabled: {
      opacity: 0.4,
    },
    sendBtnText: {
      color: colors.teal,
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
      backgroundColor: colors.bg,
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
      backgroundColor: colors.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
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

    // Memory editor
    memoryTabBar: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    memoryTab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: "center",
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    memoryTabActive: {
      borderBottomColor: colors.teal,
    },
    memoryTabText: {
      fontSize: 13,
      color: colors.muted,
    },
    memoryTabTextActive: {
      color: colors.teal,
      fontWeight: "600",
    },
    memoryBody: {
      padding: 16,
    },
    memoryInput: {
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      color: colors.text,
      fontSize: 13,
      minHeight: 200,
      textAlignVertical: "top",
      marginBottom: 12,
    },
    memorySaveBtn: {
      backgroundColor: "rgba(20,184,166,0.25)",
      borderWidth: 1,
      borderColor: "rgba(20,184,166,0.4)",
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
    },
    memorySaveBtnText: {
      color: colors.teal,
      fontWeight: "600",
      fontSize: 13,
    },

  });
}
