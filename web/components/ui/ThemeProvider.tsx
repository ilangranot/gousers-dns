"use client";
import { createContext, useContext, useEffect, useState } from "react";

type ThemeId = "midnight" | "ocean" | "forest" | "sunset" | "light";

interface ThemeCtx {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "midnight",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("midnight");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as ThemeId | null;
    if (saved) applyTheme(saved);
  }, []);

  function applyTheme(t: ThemeId) {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("theme", t);
    setThemeState(t);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme: applyTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
