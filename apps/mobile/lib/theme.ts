import { StyleSheet } from "react-native";

export type ThemeVariant = "rain" | "starfield";
export type FontChoice = "system" | "serif" | "monospace";

export interface ThemeColors {
  bg: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  teal: string;
  tealDark: string;
  tealBg: string;
  red: string;
  redBg: string;
  emerald: string;
  emeraldBg: string;
  slate500: string;
  slate600: string;
  white: string;
  black50: string;
}

const shared: Omit<ThemeColors, "bg" | "card" | "border"> = {
  text: "#e2e8f0",
  muted: "#94a3b8",
  teal: "#14b8a6",
  tealDark: "#0f766e",
  tealBg: "rgba(20,184,166,0.15)",
  red: "#ef4444",
  redBg: "rgba(239,68,68,0.15)",
  emerald: "#34d399",
  emeraldBg: "rgba(52,211,153,0.15)",
  slate500: "#64748b",
  slate600: "#475569",
  white: "#ffffff",
  black50: "rgba(0,0,0,0.5)",
};

const rainColors: ThemeColors = {
  ...shared,
  bg: "#0a0c12",
  card: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.12)",
};

const starfieldColors: ThemeColors = {
  ...shared,
  bg: "#050510",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.10)",
};

export function getThemeColors(variant: ThemeVariant): ThemeColors {
  return variant === "rain" ? rainColors : starfieldColors;
}

export function getBaseStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex1: { flex: 1 },
    bgDark: { backgroundColor: "transparent" },
    row: { flexDirection: "row" },
    rowCenter: { flexDirection: "row", alignItems: "center" },
    center: { alignItems: "center", justifyContent: "center" },
    gap2: { gap: 8 },
    gap3: { gap: 12 },
    p4: { padding: 16 },
    px4: { paddingHorizontal: 16 },
    py3: { paddingVertical: 12 },
    mb1: { marginBottom: 4 },
    mb2: { marginBottom: 8 },
    mb3: { marginBottom: 12 },
    mb4: { marginBottom: 16 },
    mb6: { marginBottom: 24 },
    mt1: { marginTop: 4 },
    mt3: { marginTop: 12 },
    mt4: { marginTop: 16 },
    mr3: { marginRight: 12 },
    card: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
    },
    input: {
      backgroundColor: "rgba(0,0,0,0.3)",
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      color: c.text,
      fontSize: 14,
    },
    btnPrimary: {
      backgroundColor: "rgba(20,184,166,0.25)",
      borderWidth: 1,
      borderColor: "rgba(20,184,166,0.4)",
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center" as const,
    },
    btnDisabled: {
      opacity: 0.4,
    },
    btnOutline: {
      backgroundColor: "rgba(255,255,255,0.08)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.15)",
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: "center" as const,
    },
    textXs: { fontSize: 11, color: c.muted },
    textSm: { fontSize: 13, color: c.muted },
    textBase: { fontSize: 15, color: c.text },
    textLg: { fontSize: 17, color: c.text, fontWeight: "600" as const },
    textXl: { fontSize: 20, color: c.text, fontWeight: "700" as const },
    text3xl: { fontSize: 28, color: c.text, fontWeight: "700" as const },
    textWhite: { color: c.white, fontWeight: "600" as const },
    textMuted: { color: c.muted },
    textTeal: { color: c.teal },
    textRed: { color: c.red },
    textCenter: { textAlign: "center" as const },
  });
}

// Default exports for backward compatibility
export const colors = starfieldColors;
export const base = getBaseStyles(starfieldColors);
