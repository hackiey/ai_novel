import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type WriteTheme = "rain" | "starfield";

interface WriteThemeContextValue {
  theme: WriteTheme;
  setTheme: (theme: WriteTheme) => void;
}

const STORAGE_KEY = "write-theme";

function loadTheme(): WriteTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "rain" || stored === "starfield") return stored;
  } catch { /* ignore */ }
  return "starfield";
}

const WriteThemeContext = createContext<WriteThemeContextValue>({
  theme: "starfield",
  setTheme: () => {},
});

export function WriteThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<WriteTheme>(loadTheme);

  const setTheme = useCallback((t: WriteTheme) => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
  }, []);

  return (
    <WriteThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </WriteThemeContext.Provider>
  );
}

export function useWriteTheme() {
  return useContext(WriteThemeContext);
}
