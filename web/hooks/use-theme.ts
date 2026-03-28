import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }
  const storedTheme = window.localStorage.getItem("theme-mode");
  return storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
    ? storedTheme
    : "system";
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("theme-mode", theme);
    const html = document.documentElement;
    if (theme === "dark") {
      html.classList.add("dark");
      html.classList.remove("light");
    } else if (theme === "light") {
      html.classList.add("light");
      html.classList.remove("dark");
    } else {
      html.classList.remove("dark", "light");
    }
  }, [theme]);

  const toggleTheme = () => {
    if (theme === "system") {
      const isSystemDark = typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(isSystemDark ? "light" : "dark");
    } else if (theme === "dark") {
      setTheme("light");
    } else {
      setTheme("system");
    }
  };

  return { theme, toggleTheme };
}
