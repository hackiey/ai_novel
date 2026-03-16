import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { Link } from "expo-router";

// For now, use a simple fetch-based API client (not tRPC which needs web adapters)
// This is a placeholder that shows the structure

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Novel</Text>
      <Text style={styles.subtitle}>Your writing projects</Text>
      {/* Project list will be fetched from the API */}
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          Connect to your server to see projects.
        </Text>
        <Text style={styles.hint}>
          Configure server URL in settings.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#0f172a" },
  title: { fontSize: 28, fontWeight: "bold", color: "#f1f5f9", marginTop: 20 },
  subtitle: { fontSize: 14, color: "#64748b", marginTop: 4, marginBottom: 24 },
  placeholder: { flex: 1, justifyContent: "center", alignItems: "center" },
  placeholderText: { fontSize: 14, color: "#475569", textAlign: "center" },
  hint: { fontSize: 12, color: "#334155", marginTop: 8, textAlign: "center" },
});
