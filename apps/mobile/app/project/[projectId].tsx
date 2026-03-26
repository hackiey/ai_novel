import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { MessageCircle, Type } from "lucide-react-native";
import { trpc } from "../../lib/trpc";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import ThemeBackground from "../../components/backgrounds/ThemeBackground";
import type { FontChoice } from "../../lib/theme";

const fontOptions: { key: FontChoice; family: string | undefined }[] = [
  { key: "system", family: undefined },
  { key: "serif", family: Platform.select({ ios: "Georgia", android: "serif" }) },
  { key: "monospace", family: Platform.select({ ios: "Menlo", android: "monospace" }) },
];

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function countWords(text: string): number {
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g);
  const cjkCount = cjk ? cjk.length : 0;
  const stripped = text.replace(
    /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g,
    " "
  );
  return cjkCount + stripped.split(/\s+/).filter(Boolean).length;
}

// ─── Block Types & Utilities ─────────────────────────────────────

type BlockType = "paragraph" | "h1" | "h2" | "h3" | "quote" | "list";

interface EditorBlock {
  key: string;
  type: BlockType;
  content: string;
}

let _blockKeyId = 0;
function nextBlockKey(): string {
  return `b${++_blockKeyId}`;
}

const TYPE_PREFIX: Record<BlockType, string> = {
  h1: "# ",
  h2: "## ",
  h3: "### ",
  quote: "> ",
  list: "- ",
  paragraph: "",
};

function parseBlockType(line: string): { type: BlockType; content: string } {
  if (line.startsWith("### ")) return { type: "h3", content: line.slice(4) };
  if (line.startsWith("## ")) return { type: "h2", content: line.slice(3) };
  if (line.startsWith("# ")) return { type: "h1", content: line.slice(2) };
  if (line.startsWith("> ")) return { type: "quote", content: line.slice(2) };
  if (/^[-*] /.test(line)) return { type: "list", content: line.slice(2) };
  return { type: "paragraph", content: line };
}

function textToBlocks(text: string): EditorBlock[] {
  if (!text) return [{ key: nextBlockKey(), type: "paragraph", content: "" }];
  return text.split("\n").map((line) => {
    const { type, content } = parseBlockType(line);
    return { key: nextBlockKey(), type, content };
  });
}

function blocksToText(blocks: EditorBlock[]): string {
  return blocks.map((b) => TYPE_PREFIX[b.type] + b.content).join("\n");
}

function detectTypeChange(
  text: string,
  currentType: BlockType
): { type: BlockType; content: string } | null {
  if (currentType !== "paragraph") return null;
  if (text.startsWith("### ")) return { type: "h3", content: text.slice(4) };
  if (text.startsWith("## ")) return { type: "h2", content: text.slice(3) };
  if (text.startsWith("# ")) return { type: "h1", content: text.slice(2) };
  if (text.startsWith("> ")) return { type: "quote", content: text.slice(2) };
  if (text.startsWith("- ")) return { type: "list", content: text.slice(2) };
  return null;
}

// ─── Inline Markdown ─────────────────────────────────────────────

function parseInlineTokens(
  text: string
): { type: "text" | "bold" | "italic" | "code"; text: string }[] {
  const tokens: { type: "text" | "bold" | "italic" | "code"; text: string }[] =
    [];
  let i = 0;
  let buf = "";
  while (i < text.length) {
    if (text[i] === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        if (buf) {
          tokens.push({ type: "text", text: buf });
          buf = "";
        }
        tokens.push({ type: "bold", text: text.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "*" && text[i + 1] !== "*") {
      const end = text.indexOf("*", i + 1);
      if (end !== -1 && text[end + 1] !== "*") {
        if (buf) {
          tokens.push({ type: "text", text: buf });
          buf = "";
        }
        tokens.push({ type: "italic", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        if (buf) {
          tokens.push({ type: "text", text: buf });
          buf = "";
        }
        tokens.push({ type: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  if (buf) tokens.push({ type: "text", text: buf });
  return tokens;
}

function InlineContent({ text, colors }: { text: string; colors: any }) {
  const tokens = parseInlineTokens(text);
  if (tokens.length === 1 && tokens[0].type === "text") return <>{text}</>;
  return (
    <>
      {tokens.map((t, i) => {
        switch (t.type) {
          case "bold":
            return (
              <Text key={i} style={{ fontWeight: "700" }}>
                {t.text}
              </Text>
            );
          case "italic":
            return (
              <Text key={i} style={{ fontStyle: "italic", color: "#cbd5e1" }}>
                {t.text}
              </Text>
            );
          case "code":
            return (
              <Text
                key={i}
                style={{
                  backgroundColor: colors.border,
                  fontSize: 13,
                  borderRadius: 3,
                }}
              >
                {" "}
                {t.text}{" "}
              </Text>
            );
          default:
            return <Text key={i}>{t.text}</Text>;
        }
      })}
    </>
  );
}

// ─── Block Display (inactive block) ─────────────────────────────

const BlockDisplay = React.memo(function BlockDisplay({
  block,
  colors,
  s,
  onPress,
  fontFamily,
}: {
  block: EditorBlock;
  colors: any;
  s: ReturnType<typeof createStyles>;
  onPress: () => void;
  fontFamily?: string;
}) {
  const textStyle = {
    h1: s.h1Text,
    h2: s.h2Text,
    h3: s.h3Text,
    quote: s.quoteText,
    list: s.paragraphText,
    paragraph: s.paragraphText,
  }[block.type];

  const fontStyle = fontFamily ? { fontFamily } : undefined;
  const isEmpty = block.content === "";

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        s.blockContainer,
        block.type === "quote" && s.quoteContainer,
      ]}
    >
      {block.type === "list" ? (
        <View style={s.listRow}>
          <Text style={s.listBullet}>•</Text>
          <Text style={[textStyle, fontStyle, isEmpty && s.emptyBlockText]}>
            {isEmpty ? " " : <InlineContent text={block.content} colors={colors} />}
          </Text>
        </View>
      ) : (
        <Text style={[textStyle, fontStyle, isEmpty && s.emptyBlockText]}>
          {isEmpty ? " " : <InlineContent text={block.content} colors={colors} />}
        </Text>
      )}
    </TouchableOpacity>
  );
});

// ─── Main Component ──────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved";

export default function ProjectEditorScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, baseStyles: base, font, setFont, fontFamily, themeVariant } = useTheme();
  const [showFontPicker, setShowFontPicker] = useState(false);

  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
    null
  );
  const [blocks, setBlocks] = useState<EditorBlock[]>([
    { key: nextBlockKey(), type: "paragraph", content: "" },
  ]);
  const [activeBlockIdx, setActiveBlockIdx] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const contentCache = useRef<Map<string, string>>(new Map());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const projectQuery = trpc.project.getById.useQuery({ id: projectId! });
  const chaptersQuery = trpc.chapter.list.useQuery({ projectId: projectId! });
  const chapterQuery = trpc.chapter.getById.useQuery(
    { id: selectedChapterId! },
    { enabled: !!selectedChapterId }
  );

  const updateChapterMut = trpc.chapter.update.useMutation({
    onSuccess: () => {
      setSaveStatus("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: () => setSaveStatus("idle"),
  });

  const createChapterMut = trpc.chapter.create.useMutation({
    onSuccess: (data: any) => {
      chaptersQuery.refetch();
      setSelectedChapterId(data._id);
    },
  });

  const deleteChapterMut = trpc.chapter.delete.useMutation({
    onSuccess: () => {
      chaptersQuery.refetch();
      setSelectedChapterId(null);
      setBlocks([{ key: nextBlockKey(), type: "paragraph", content: "" }]);
    },
  });

  const chapters = (chaptersQuery.data ?? []) as any[];
  const project = projectQuery.data as any;

  // Auto-select first chapter
  useEffect(() => {
    if (!selectedChapterId && chapters.length > 0) {
      setSelectedChapterId(chapters[0]._id);
    }
  }, [chapters, selectedChapterId]);

  // Load chapter content
  useEffect(() => {
    if (chapterQuery.data && selectedChapterId) {
      const cached = contentCache.current.get(selectedChapterId);
      if (cached !== undefined) {
        setBlocks(textToBlocks(cached));
      } else {
        const raw = (chapterQuery.data as any).content || "";
        setBlocks(textToBlocks(stripHtml(raw)));
      }
      setActiveBlockIdx(null);
    }
  }, [chapterQuery.data, selectedChapterId]);

  const flushSave = useCallback(
    (chapterId: string, text: string) => {
      contentCache.current.delete(chapterId);
      setSaveStatus("saving");
      updateChapterMut.mutate({ id: chapterId, data: { content: text } });
    },
    [updateChapterMut]
  );

  const scheduleAutoSave = useCallback(
    (newBlocks: EditorBlock[]) => {
      if (!selectedChapterId) return;
      const text = blocksToText(newBlocks);
      contentCache.current.set(selectedChapterId, text);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        flushSave(selectedChapterId, text);
      }, 2000);
    },
    [selectedChapterId, flushSave]
  );

  // ─── Block editing handlers ────────────────────────────────────

  const handleBlockTextChange = useCallback(
    (idx: number, text: string) => {
      const current = blocksRef.current;

      // Enter / paste — split on newlines
      if (text.includes("\n")) {
        const lines = text.split("\n");
        const updated = [...current];
        updated[idx] = { ...updated[idx], content: lines[0] };
        const extra = lines.slice(1).map((line) => {
          const p = parseBlockType(line);
          return { key: nextBlockKey(), type: p.type, content: p.content };
        });
        updated.splice(idx + 1, 0, ...extra);
        setBlocks(updated);
        setActiveBlockIdx(idx + lines.length - 1);
        scheduleAutoSave(updated);
        return;
      }

      // Detect markdown prefix → change block type
      const tc = detectTypeChange(text, current[idx].type);
      if (tc) {
        const updated = [...current];
        updated[idx] = { ...updated[idx], type: tc.type, content: tc.content };
        setBlocks(updated);
        scheduleAutoSave(updated);
        return;
      }

      // Normal text change
      const updated = [...current];
      updated[idx] = { ...updated[idx], content: text };
      setBlocks(updated);
      scheduleAutoSave(updated);
    },
    [scheduleAutoSave]
  );

  const handleBlockBackspace = useCallback(
    (idx: number) => {
      const current = blocksRef.current;
      const block = current[idx];
      if (block.content !== "") return;

      // Special type → convert to paragraph first
      if (block.type !== "paragraph") {
        const updated = [...current];
        updated[idx] = { ...updated[idx], type: "paragraph" };
        setBlocks(updated);
        return;
      }

      // First block can't be deleted
      if (idx === 0) return;

      // Merge with previous block
      const updated = [...current];
      updated.splice(idx, 1);
      setBlocks(updated);
      setActiveBlockIdx(idx - 1);
      scheduleAutoSave(updated);
    },
    [scheduleAutoSave]
  );

  // ─── Chapter management handlers ──────────────────────────────

  const handleSelectChapter = useCallback(
    (chapterId: string) => {
      if (chapterId === selectedChapterId) return;
      if (selectedChapterId && contentCache.current.has(selectedChapterId)) {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        flushSave(
          selectedChapterId,
          contentCache.current.get(selectedChapterId)!
        );
      }
      setSelectedChapterId(chapterId);
      setActiveBlockIdx(null);
    },
    [selectedChapterId, flushSave]
  );

  const handleCreateChapter = useCallback(() => {
    createChapterMut.mutate({
      projectId: projectId!,
      title: t("editor.newChapter"),
    });
  }, [projectId, t, createChapterMut]);

  const handleChapterLongPress = useCallback(
    (chapter: any) => {
      Alert.alert(t("editor.chapterActions"), undefined, [
        {
          text: t("editor.rename"),
          onPress: () => {
            Alert.prompt?.(
              t("editor.rename"),
              undefined,
              (newTitle: string) => {
                if (newTitle?.trim()) {
                  updateChapterMut.mutate({
                    id: chapter._id,
                    data: { title: newTitle.trim() },
                  });
                  chaptersQuery.refetch();
                }
              },
              "plain-text",
              chapter.title
            );
          },
        },
        {
          text: t("editor.delete"),
          style: "destructive",
          onPress: () => {
            Alert.alert(
              t("editor.deleteConfirm", { name: chapter.title }),
              undefined,
              [
                { text: t("common.cancel"), style: "cancel" },
                {
                  text: t("common.delete"),
                  style: "destructive",
                  onPress: () => {
                    contentCache.current.delete(chapter._id);
                    deleteChapterMut.mutate({ id: chapter._id });
                  },
                },
              ]
            );
          },
        },
        { text: t("common.cancel"), style: "cancel" },
      ]);
    },
    [t, updateChapterMut, deleteChapterMut, chaptersQuery]
  );

  // ─── Derived values ────────────────────────────────────────────

  const fullText = useMemo(() => blocksToText(blocks), [blocks]);
  const wordCount = useMemo(() => countWords(fullText), [fullText]);
  const s = useMemo(() => createStyles(colors), [colors]);

  // ─── Render ────────────────────────────────────────────────────

  if (projectQuery.isLoading) {
    return (
      <View style={[base.flex1, base.bgDark, base.center]}>
        <ActivityIndicator color={colors.teal} size="large" />
      </View>
    );
  }

  return (
    <View style={[base.flex1, base.bgDark]}>
      <ThemeBackground theme={themeVariant} bgColor={colors.bg} />
      <Stack.Screen
        options={{
          title: project?.name ?? "",
          headerRight: () => (
            <View style={s.headerRight}>
              <TouchableOpacity
                onPress={() => setShowFontPicker(true)}
                style={s.headerIconBtn}
              >
                <Type size={18} color={colors.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (project?.worldId) router.push(`/chat/${project.worldId}`);
                }}
                style={s.headerIconBtn}
              >
                <MessageCircle size={18} color={colors.teal} />
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
        {/* Chapter selector */}
        <View style={s.chapterSelectorWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chapterSelectorContent}
          >
            {chapters.map((ch: any) => (
              <TouchableOpacity
                key={ch._id}
                onPress={() => handleSelectChapter(ch._id)}
                onLongPress={() => handleChapterLongPress(ch)}
                style={[
                  s.chapterPill,
                  selectedChapterId === ch._id
                    ? s.chapterPillActive
                    : s.chapterPillInactive,
                ]}
              >
                <Text
                  style={[
                    s.chapterPillText,
                    selectedChapterId === ch._id && s.chapterPillTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {ch.title}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={handleCreateChapter}
              disabled={createChapterMut.isPending}
              style={s.addChapterBtn}
            >
              <Text style={s.addChapterText}>+</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Word count + save status */}
        {selectedChapterId && (
          <View style={s.toolBar}>
            <Text style={s.wordCountText}>
              {t("editor.wordCount", { count: wordCount })}
            </Text>
            {saveStatus !== "idle" && (
              <Text style={s.saveText}>
                {saveStatus === "saving"
                  ? t("editor.saving")
                  : t("editor.saved")}
              </Text>
            )}
          </View>
        )}

        {/* Editor area */}
        {chapters.length === 0 ? (
          <View style={[base.flex1, base.center]}>
            <Text style={[base.textLg, base.mb3]}>
              {t("editor.createFirst")}
            </Text>
            <Text style={[base.textSm, base.mb4]}>
              {t("editor.createFirstHint")}
            </Text>
            <TouchableOpacity
              onPress={handleCreateChapter}
              disabled={createChapterMut.isPending}
              style={base.btnPrimary}
            >
              <Text style={base.textWhite}>+ {t("editor.newChapter")}</Text>
            </TouchableOpacity>
          </View>
        ) : selectedChapterId && chapterQuery.isLoading ? (
          <View style={[base.flex1, base.center]}>
            <ActivityIndicator color={colors.teal} />
          </View>
        ) : (
          <ScrollView
            style={base.flex1}
            contentContainerStyle={s.editorScroll}
            keyboardShouldPersistTaps="handled"
          >
            {blocks.map((block, idx) =>
              activeBlockIdx === idx ? (
                <View
                  key={block.key}
                  style={[
                    s.blockContainer,
                    block.type === "quote" && s.quoteContainer,
                  ]}
                >
                  {block.type === "list" && (
                    <Text style={s.listBullet}>•</Text>
                  )}
                  <TextInput
                    value={block.content}
                    onChangeText={(text) => handleBlockTextChange(idx, text)}
                    onKeyPress={({ nativeEvent }) => {
                      if (
                        nativeEvent.key === "Backspace" &&
                        blocksRef.current[idx]?.content === ""
                      ) {
                        handleBlockBackspace(idx);
                      }
                    }}
                    autoFocus
                    multiline
                    blurOnSubmit={false}
                    scrollEnabled={false}
                    style={[
                      s.blockInputBase,
                      {
                        h1: s.h1Text,
                        h2: s.h2Text,
                        h3: s.h3Text,
                        quote: s.quoteText,
                        list: s.paragraphText,
                        paragraph: s.paragraphText,
                      }[block.type],
                      fontFamily ? { fontFamily } : undefined,
                    ]}
                    placeholderTextColor={colors.slate500}
                  />
                </View>
              ) : (
                <BlockDisplay
                  key={block.key}
                  block={block}
                  colors={colors}
                  s={s}
                  onPress={() => setActiveBlockIdx(idx)}
                  fontFamily={fontFamily}
                />
              )
            )}
            {/* Tap below content to add/focus last block */}
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => {
                if (blocks.length > 0) {
                  const last = blocks.length - 1;
                  if (blocks[last].content === "" && blocks[last].type === "paragraph") {
                    setActiveBlockIdx(last);
                  } else {
                    const updated = [
                      ...blocksRef.current,
                      { key: nextBlockKey(), type: "paragraph" as BlockType, content: "" },
                    ];
                    setBlocks(updated);
                    setActiveBlockIdx(updated.length - 1);
                  }
                }
              }}
              style={s.bottomTapArea}
            />
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* Font Picker Modal */}
      <Modal visible={showFontPicker} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowFontPicker(false)}
          style={s.fontModalOverlay}
        >
          <View style={s.fontModalContent}>
            <Text style={s.fontModalTitle}>{t("settings.font")}</Text>
            {fontOptions.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => {
                  setFont(opt.key);
                  setShowFontPicker(false);
                }}
                style={[
                  s.fontOption,
                  font === opt.key && s.fontOptionActive,
                ]}
              >
                <Text style={[s.fontOptionLabel, font === opt.key && { color: colors.teal }]}>
                  {t(`settings.font_${opt.key}`)}
                </Text>
                <Text style={[s.fontPreview, { fontFamily: opt.family }]}>
                  {t("settings.fontPreview")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────

function createStyles(colors: any) {
  return StyleSheet.create({
    headerRight: {
      flexDirection: "row",
      gap: 12,
      marginRight: 8,
    },
    headerIconBtn: {
      padding: 6,
    },
    saveText: {
      fontSize: 11,
      color: colors.teal,
    },
    chapterSelectorWrap: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    chapterSelectorContent: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 8,
    },
    chapterPill: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 9999,
      borderWidth: 1,
    },
    chapterPillActive: {
      backgroundColor: "rgba(20,184,166,0.15)",
      borderColor: "rgba(20,184,166,0.4)",
    },
    chapterPillInactive: {
      backgroundColor: colors.card,
      borderColor: colors.border,
    },
    chapterPillText: {
      fontSize: 13,
      color: colors.muted,
      maxWidth: 120,
    },
    chapterPillTextActive: {
      color: colors.teal,
      fontWeight: "600",
    },
    addChapterBtn: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 9999,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    addChapterText: {
      fontSize: 15,
      color: colors.muted,
    },
    toolBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 6,
    },
    wordCountText: {
      fontSize: 11,
      color: colors.slate500,
    },
    editorScroll: {
      paddingBottom: 120,
    },
    // Block container
    blockContainer: {
      paddingHorizontal: 16,
      paddingVertical: 2,
      minHeight: 28,
    },
    // Block text styles
    h1Text: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text,
      lineHeight: 30,
    },
    h2Text: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text,
      lineHeight: 26,
    },
    h3Text: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
      lineHeight: 24,
    },
    paragraphText: {
      fontSize: 15,
      color: colors.text,
      lineHeight: 24,
    },
    quoteContainer: {
      borderLeftWidth: 3,
      borderLeftColor: colors.slate600,
      marginLeft: 16,
      paddingLeft: 12,
      paddingHorizontal: 0,
    },
    quoteText: {
      fontSize: 15,
      color: colors.muted,
      fontStyle: "italic",
      lineHeight: 24,
    },
    listRow: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    listBullet: {
      fontSize: 15,
      color: colors.muted,
      marginRight: 8,
      lineHeight: 24,
    },
    emptyBlockText: {
      minHeight: 24,
    },
    // TextInput for active block
    blockInputBase: {
      flex: 1,
      padding: 0,
      margin: 0,
      textAlignVertical: "top",
    },
    bottomTapArea: {
      minHeight: 200,
    },
    // Font picker modal
    fontModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    fontModalContent: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
      width: "80%",
      gap: 8,
    },
    fontModalTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 4,
    },
    fontOption: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: "rgba(255,255,255,0.04)",
    },
    fontOptionActive: {
      borderColor: colors.teal,
      backgroundColor: "rgba(20,184,166,0.1)",
    },
    fontOptionLabel: {
      fontSize: 13,
      color: colors.text,
      fontWeight: "500",
    },
    fontPreview: {
      fontSize: 13,
      color: colors.muted,
    },
  });
}
