"use client";

import { useCallback, useEffect, useState } from "react";

export const ACCENT_THEMES = [
  { id: "ocean", name: "深海", color: "#1769e0" },
  { id: "forest", name: "森林", color: "#147a5b" },
  { id: "amber", name: "琥珀", color: "#b86514" },
  { id: "rose", name: "玫瑰", color: "#b54062" },
  { id: "violet", name: "紫罗兰", color: "#7357c7" },
  { id: "graphite", name: "石墨", color: "#4a5262" },
] as const;

export type AccentThemeId = (typeof ACCENT_THEMES)[number]["id"] | "custom";
const THEME_KEY = "doc2alpaca-accent-theme";
const CUSTOM_KEY = "doc2alpaca-custom-accent";
const DEFAULT_CUSTOM = "#147a5b";

function applyAccentTheme(theme: AccentThemeId, customColor = DEFAULT_CUSTOM) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.accent = theme;
  if (theme === "custom") root.style.setProperty("--custom-accent", customColor);
  else root.style.removeProperty("--custom-accent");
}

export function useAccentTheme() {
  const [theme, setThemeState] = useState<AccentThemeId>("ocean");
  const [customColor, setCustomColorState] = useState(DEFAULT_CUSTOM);

  useEffect(() => {
    const storedTheme = (localStorage.getItem(THEME_KEY) || "ocean") as AccentThemeId;
    const storedCustom = localStorage.getItem(CUSTOM_KEY) || DEFAULT_CUSTOM;
    setThemeState(storedTheme);
    setCustomColorState(storedCustom);
    applyAccentTheme(storedTheme, storedCustom);
  }, []);

  const setTheme = useCallback((next: AccentThemeId) => {
    setThemeState(next);
    localStorage.setItem(THEME_KEY, next);
    applyAccentTheme(next, localStorage.getItem(CUSTOM_KEY) || DEFAULT_CUSTOM);
  }, []);

  const setCustomColor = useCallback((color: string) => {
    setCustomColorState(color);
    setThemeState("custom");
    localStorage.setItem(CUSTOM_KEY, color);
    localStorage.setItem(THEME_KEY, "custom");
    applyAccentTheme("custom", color);
  }, []);

  return { theme, customColor, setTheme, setCustomColor };
}