// ============================================================
// useDarkMode — 暗色模式 Hook
//
// 职责：管理 dark class 的切换和持久化
//       优先读取 LocalStorage，其次系统偏好
// ============================================================

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "doc2alpaca-dark-mode";

/**
 * 获取初始暗色模式状态
 * 优先从 LocalStorage 读取，其次系统偏好
 */
function getInitialDark(): boolean {
  if (typeof window === "undefined") return false;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) {
    return stored === "true";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * 同步 dark class 到 <html> 元素
 */
function applyDarkClass(isDark: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", isDark);
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState(false);

  // 初始化
  useEffect(() => {
    const initial = getInitialDark();
    setIsDark(initial);
    applyDarkClass(initial);

    // 监听系统主题变化
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      // 仅在用户未手动设置时跟随系统
      if (localStorage.getItem(STORAGE_KEY) === null) {
        setIsDark(e.matches);
        applyDarkClass(e.matches);
      }
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      applyDarkClass(next);
      return next;
    });
  }, []);

  const setDark = useCallback((value: boolean) => {
    setIsDark(value);
    localStorage.setItem(STORAGE_KEY, String(value));
    applyDarkClass(value);
  }, []);

  return { isDark, toggle, setDark };
}
