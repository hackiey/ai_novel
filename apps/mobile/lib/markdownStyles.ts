import { type ThemeColors, colors as defaultColors } from "./theme";

export function getMarkdownStyles(c: ThemeColors, fontFamily?: string) {
  return {
    body: { color: c.text, fontSize: 14, lineHeight: 20, fontFamily },
    paragraph: { marginTop: 0, marginBottom: 8 },
    code_inline: {
      backgroundColor: c.border,
      color: c.text,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
      fontSize: 13,
    },
    fence: {
      backgroundColor: c.card,
      color: c.text,
      padding: 12,
      borderRadius: 8,
      fontSize: 13,
    },
    heading1: { color: c.text, fontSize: 20, fontWeight: "700" as const },
    heading2: { color: c.text, fontSize: 18, fontWeight: "700" as const },
    heading3: { color: c.text, fontSize: 16, fontWeight: "600" as const },
    list_item: { color: c.text },
    bullet_list: { color: c.text },
    ordered_list: { color: c.text },
    blockquote: {
      borderLeftColor: c.slate600,
      borderLeftWidth: 3,
      paddingLeft: 12,
      backgroundColor: c.card,
      borderRadius: 4,
    },
    strong: { color: c.text, fontWeight: "700" as const },
    em: { color: "#cbd5e1", fontStyle: "italic" as const },
    link: { color: c.teal },
  };
}

// Default export for backward compatibility
export const markdownStyles = getMarkdownStyles(defaultColors);
