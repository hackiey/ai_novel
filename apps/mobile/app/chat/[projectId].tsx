import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams } from "expo-router";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// TODO: Replace with actual server URL from settings/config
const API_BASE = "http://localhost:3000";

export default function ChatScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList<Message>>(null);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`${API_BASE}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, message: text }),
      });

      const data = await res.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.reply ?? "No response from agent.",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Could not reach the server. Check your connection and server URL.",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View
        style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        <Text style={styles.messageRole}>
          {isUser ? "You" : "AI Agent"}
        </Text>
        <Text style={styles.messageText}>{item.content}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      {messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Chat with your AI agent</Text>
          <Text style={styles.emptyHint}>
            Ask about plot ideas, character development, or get help writing
            your next chapter.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
        />
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor="#475569"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
          multiline
          maxLength={2000}
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendButton, sending && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={sending}
        >
          <Text style={styles.sendButtonText}>{sending ? "..." : "Send"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#e2e8f0",
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
  },
  messageList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageBubble: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    maxWidth: "85%",
  },
  userBubble: {
    backgroundColor: "#312e81",
    alignSelf: "flex-end",
  },
  assistantBubble: {
    backgroundColor: "#1e293b",
    alignSelf: "flex-start",
  },
  messageRole: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6366f1",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  messageText: {
    fontSize: 14,
    color: "#e2e8f0",
    lineHeight: 20,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    backgroundColor: "#0f172a",
  },
  textInput: {
    flex: 1,
    backgroundColor: "#1e293b",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#f1f5f9",
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: "#6366f1",
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#3730a3",
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
});
