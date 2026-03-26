import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem("theme-mode") as ThemeMode) || "system";
  });

  useEffect(() => {
    localStorage.setItem("theme-mode", theme);
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
      const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(isSystemDark ? "light" : "dark");
    } else if (theme === "dark") {
      setTheme("light");
    } else {
      setTheme("system");
    }
  };

  return { theme, toggleTheme };
}
