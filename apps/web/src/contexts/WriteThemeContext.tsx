import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type WriteTheme = "rain" | "starfield";
export type WriteFont = "default" | "longcang" | "liujianmaocao" | "zhimangxing" | "mashanzheng" | "zcoolkuaile" | "zcoolqingkehuangyou" | "zcoolxiaowei" | "xiaolai" | "neoxihei" | "markergothic";

interface WriteThemeContextValue {
  theme: WriteTheme;
  setTheme: (theme: WriteTheme) => void;
  font: WriteFont;
  setFont: (font: WriteFont) => void;
}

const STORAGE_KEY = "write-theme";
const FONT_STORAGE_KEY = "write-font";

function loadTheme(): WriteTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "rain" || stored === "starfield") return stored;
  } catch { /* ignore */ }
  return "starfield";
}

const VALID_FONTS: WriteFont[] = ["default", "longcang", "liujianmaocao", "zhimangxing", "mashanzheng", "zcoolkuaile", "zcoolqingkehuangyou", "zcoolxiaowei", "xiaolai", "neoxihei", "markergothic"];

function loadFont(): WriteFont {
  try {
    const stored = localStorage.getItem(FONT_STORAGE_KEY);
    if (VALID_FONTS.includes(stored as WriteFont)) return stored as WriteFont;
  } catch { /* ignore */ }
  return "default";
}

const WriteThemeContext = createContext<WriteThemeContextValue>({
  theme: "starfield",
  setTheme: () => {},
  font: "default",
  setFont: () => {},
});

export function WriteThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<WriteTheme>(loadTheme);
  const [font, setFontState] = useState<WriteFont>(loadFont);

  const setTheme = useCallback((t: WriteTheme) => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
  }, []);

  const setFont = useCallback((f: WriteFont) => {
    setFontState(f);
    try { localStorage.setItem(FONT_STORAGE_KEY, f); } catch { /* ignore */ }
  }, []);

  return (
    <WriteThemeContext.Provider value={{ theme, setTheme, font, setFont }}>
      {children}
    </WriteThemeContext.Provider>
  );
}

export function useWriteTheme() {
  return useContext(WriteThemeContext);
}
