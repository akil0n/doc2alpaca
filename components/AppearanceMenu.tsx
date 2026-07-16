"use client";

import { useEffect, useRef, useState } from "react";
import { ACCENT_THEMES, useAccentTheme } from "@/lib/useAccentTheme";
import { useDarkMode } from "@/lib/useDarkMode";

export function AppearanceMenu() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { isDark, toggle } = useDarkMode();
  const { theme, customColor, setTheme, setCustomColor } = useAccentTheme();

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="appearance-control relative" ref={panelRef}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="header-icon-button" aria-label="调整界面外观" aria-expanded={open} aria-haspopup="dialog">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 1.25a6.75 6.75 0 100 13.5h.72a1.35 1.35 0 00.54-2.59.72.72 0 01.29-1.38h1.2A4 4 0 0014.75 6.8 5.56 5.56 0 008 1.25z" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="4.7" cy="6.1" r=".8" fill="currentColor" /><circle cx="7" cy="4.35" r=".8" fill="currentColor" /><circle cx="10" cy="4.55" r=".8" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="appearance-panel" role="dialog" aria-label="界面外观">
          <div className="appearance-panel__head">
            <div><strong>界面外观</strong><span>选择更适合你的工作氛围</span></div>
            <button type="button" onClick={toggle} className="appearance-mode" aria-label="切换明暗模式">
              <span>{isDark ? "深色" : "浅色"}</span><span className="appearance-mode__track" data-active={isDark}><span /></span>
            </button>
          </div>
          <div className="appearance-swatches" aria-label="主题色预设">
            {ACCENT_THEMES.map((item) => (
              <button type="button" key={item.id} onClick={() => setTheme(item.id)} className="appearance-swatch" data-active={theme === item.id} aria-label={`使用${item.name}主题`}>
                <span style={{ background: item.color }} /><small>{item.name}</small>
              </button>
            ))}
          </div>
          <label className="appearance-custom">
            <span><strong>自定义颜色</strong><small>自动生成协调的明暗层级</small></span>
            <span className="appearance-color-input" style={{ background: customColor }}>
              <input type="color" value={customColor} onChange={(event) => setCustomColor(event.target.value)} aria-label="选择自定义主题色" />
            </span>
          </label>
        </div>
      )}
    </div>
  );
}