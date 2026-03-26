import { colors } from "./theme";

export const markdownStyles = {
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
