import { type FrontierThemeMode } from "@frontier/shared";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

const STORAGE_KEY = "frontier-theme-mode";

interface ThemeContextValue {
  mode: FrontierThemeMode;
  setMode: (mode: FrontierThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialThemeMode(): FrontierThemeMode {
  if (typeof window === "undefined") {
    return "night";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "day" || stored === "night" || stored === "highContrast") {
    return stored;
  }

  return "night";
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<FrontierThemeMode>(getInitialThemeMode);

  useEffect(() => {
    document.documentElement.dataset.theme = mode === "highContrast" ? "high-contrast" : mode;
    document.documentElement.style.colorScheme = mode === "day" ? "light" : "dark";
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const value = useMemo(
    () => ({
      mode,
      setMode,
    }),
    [mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }
  return value;
}
