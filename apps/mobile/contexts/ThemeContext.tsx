import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type ThemeVariant,
  type FontChoice,
  type ThemeColors,
  getThemeColors,
  getBaseStyles,
} from "../lib/theme";

const THEME_KEY = "ai_novel_theme";
const FONT_KEY = "ai_novel_font";

interface ThemeContextValue {
  themeVariant: ThemeVariant;
  setThemeVariant: (v: ThemeVariant) => void;
  font: FontChoice;
  setFont: (f: FontChoice) => void;
  colors: ThemeColors;
  baseStyles: ReturnType<typeof getBaseStyles>;
  fontFamily: string | undefined;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getFontFamily(font: FontChoice): string | undefined {
  switch (font) {
    case "serif":
      return Platform.select({ ios: "Georgia", android: "serif" });
    case "monospace":
      return Platform.select({ ios: "Menlo", android: "monospace" });
    default:
      return undefined;
  }
}

function isValidTheme(v: string | null): v is ThemeVariant {
  return v === "rain" || v === "starfield";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeVariant, setThemeVariantState] = useState<ThemeVariant>("starfield");
  const [font, setFontState] = useState<FontChoice>("system");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(THEME_KEY),
      AsyncStorage.getItem(FONT_KEY),
    ]).then(([savedTheme, savedFont]) => {
      if (isValidTheme(savedTheme)) setThemeVariantState(savedTheme);
      if (savedFont) setFontState(savedFont as FontChoice);
      setLoaded(true);
    });
  }, []);

  const setThemeVariant = useCallback((v: ThemeVariant) => {
    setThemeVariantState(v);
    AsyncStorage.setItem(THEME_KEY, v);
  }, []);

  const setFont = useCallback((f: FontChoice) => {
    setFontState(f);
    AsyncStorage.setItem(FONT_KEY, f);
  }, []);

  const colors = useMemo(() => getThemeColors(themeVariant), [themeVariant]);
  const baseStyles = useMemo(() => getBaseStyles(colors), [colors]);
  const fontFamily = useMemo(() => getFontFamily(font), [font]);

  if (!loaded) return null;

  return (
    <ThemeContext.Provider
      value={{
        themeVariant,
        setThemeVariant,
        font,
        setFont,
        colors,
        baseStyles,
        fontFamily,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
