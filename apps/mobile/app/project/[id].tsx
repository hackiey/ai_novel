import { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";

type Tab = "chapters" | "chat";

const PLACEHOLDER_CHAPTERS = [
  { id: "1", title: "Chapter 1", wordCount: 0 },
  { id: "2", title: "Chapter 2", wordCount: 0 },
  { id: "3", title: "Chapter 3", wordCount: 0 },
];

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("chapters");

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "chapters" && styles.tabActive]}
          onPress={() => setActiveTab("chapters")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "chapters" && styles.tabTextActive,
            ]}
          >
            Chapters
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "chat" && styles.tabActive]}
          onPress={() => setActiveTab("chat")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "chat" && styles.tabTextActive,
            ]}
          >
            AI Chat
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === "chapters" ? (
        <FlatList
          data={PLACEHOLDER_CHAPTERS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.chapterCard}>
              <Text style={styles.chapterTitle}>{item.title}</Text>
              <Text style={styles.chapterMeta}>
                {item.wordCount.toLocaleString()} words
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No chapters yet.</Text>
            </View>
          }
        />
      ) : (
        <View style={styles.chatPrompt}>
          <Text style={styles.chatPromptText}>
            Start a conversation with the AI writing agent.
          </Text>
          <TouchableOpacity
            style={styles.chatButton}
            onPress={() => router.push(`/chat/${id}`)}
          >
            <Text style={styles.chatButtonText}>Open Chat</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: "#6366f1",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
  },
  tabTextActive: {
    color: "#e2e8f0",
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  chapterCard: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
  },
  chapterTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f1f5f9",
  },
  chapterMeta: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 14,
    color: "#475569",
  },
  chatPrompt: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  chatPromptText: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
    marginBottom: 20,
  },
  chatButton: {
    backgroundColor: "#6366f1",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 8,
  },
  chatButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
});
