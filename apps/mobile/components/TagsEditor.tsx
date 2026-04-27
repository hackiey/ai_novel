import { useState, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../contexts/ThemeContext";

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxLength?: number;
}

export default function TagsEditor({ value, onChange, placeholder, maxLength = 100 }: Props) {
  const { colors } = useTheme();
  const [input, setInput] = useState("");
  const s = useMemo(() => createStyles(colors), [colors]);

  const commit = (raw: string) => {
    const tag = raw.trim().slice(0, maxLength);
    if (!tag) return;
    if (value.includes(tag)) {
      setInput("");
      return;
    }
    onChange([...value, tag]);
    setInput("");
  };

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  return (
    <View style={s.container}>
      {value.map((tag) => (
        <View key={tag} style={s.chip}>
          <Text style={s.chipText}>{tag}</Text>
          <TouchableOpacity onPress={() => remove(tag)} hitSlop={6}>
            <Text style={s.chipRemove}>×</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TextInput
        value={input}
        onChangeText={setInput}
        onSubmitEditing={() => commit(input)}
        onBlur={() => input && commit(input)}
        placeholder={value.length === 0 ? placeholder : ""}
        placeholderTextColor={colors.slate500}
        returnKeyType="done"
        blurOnSubmit={false}
        style={s.input}
      />
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 8,
      backgroundColor: colors.bg,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    chipText: {
      color: colors.text,
      fontSize: 12,
    },
    chipRemove: {
      color: colors.muted,
      fontSize: 14,
      lineHeight: 16,
      paddingHorizontal: 2,
    },
    input: {
      flex: 1,
      minWidth: 80,
      color: colors.text,
      fontSize: 13,
      paddingVertical: 2,
    },
  });
}
