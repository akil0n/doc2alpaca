"use client";

import { AppearanceMenu } from "@/components/AppearanceMenu";
import { useState, useEffect } from "react";

interface PageHeaderProps {
  onOpenConfig?: () => void;
  onOpenHistory?: () => void;
  configReady?: boolean;
  historyCount?: number;
}

export function PageHeader({
  onOpenConfig,
  onOpenHistory,
  configReady,
  historyCount = 0,
}: PageHeaderProps) {

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`app-header fixed top-0 left-0 right-0 z-50 glass transition-all duration-500 ease-apple ${
        scrolled
          ? "h-12 border-b"
          : "h-14 border-b border-transparent"
      }`}
      style={{
        borderBottomColor: scrolled
          ? "var(--header-border)"
          : "transparent",
      }}
    >
      <div className="mx-auto max-w-6xl px-6 h-full flex items-center justify-between">
        {/* Logo */}
        <div className="app-wordmark flex items-center gap-2.5 animate-fade-in-down">
          <div
            className="app-logo-mark w-7 h-7 rounded-[8px] flex items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, var(--accent), var(--accent-highlight))",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="text-white"
            >
              <path
                d="M3 4.5C3 3.67 3.67 3 4.5 3H8c2.76 0 5 2.24 5 5s-2.24 5-5 5H4.5C3.67 13 3 12.33 3 11.5v-7z"
                fill="currentColor"
                opacity="0.9"
              />
              <circle cx="6.5" cy="8" r="1.5" fill="white" opacity="0.95" />
            </svg>
          </div>
          <span
            className="text-headline text-[15px]"
            style={{ color: "var(--text-primary)" }}
          >
            Doc<span style={{ color: "var(--accent)" }}>2</span>Alpaca
          </span>
        </div>

        {/* 右侧操作 */}
        <div className="header-actions flex items-center gap-2 animate-fade-in-down delay-100">
          {/* 历史记录按钮 */}
          {onOpenHistory && (
            <button
              onClick={onOpenHistory}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all duration-300 ease-apple hover:scale-105"
              style={{
                background: "var(--bg-surface-secondary)",
                color: "var(--text-secondary)",
              }}
              aria-label="历史记录"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="8" cy="8" r="6.5" />
                <path d="M8 4v4l2.5 1.5" />
              </svg>
              历史
              {historyCount > 0 && (
                <span
                  className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-mono font-bold flex items-center justify-center"
                  style={{
                    background: "var(--accent)",
                    color: "#fff",
                  }}
                >
                  {historyCount > 99 ? "99+" : historyCount}
                </span>
              )}
            </button>
          )}

          {/* LLM 配置按钮 */}
          {onOpenConfig && (
            <button
              onClick={onOpenConfig}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all duration-300 ease-apple hover:scale-105"
              style={{
                background: configReady
                  ? "var(--bg-surface-secondary)"
                  : "var(--accent)",
                color: configReady
                  ? "var(--text-secondary)"
                  : "#fff",
              }}
              aria-label="LLM 配置"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5L8 1z" />
              </svg>
              {configReady ? "已配置" : "配置 LLM"}
            </button>
          )}

          <AppearanceMenu />

          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost px-3.5 py-1.5 text-[13px] font-medium flex items-center gap-1.5 transition-all duration-300 ease-apple"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.86 3.75-3.64 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
}
