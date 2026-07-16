"use client";

import { useEffect, useMemo, useState } from "react";
import type { AlpacaItem } from "@/types";

interface DatasetPreviewProps {
  data: AlpacaItem[];
}

const PAGE_SIZE = 10;

export function DatasetPreview({ data }: DatasetPreviewProps) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AlpacaItem | null>(null);
  const [mounted, setMounted] = useState(false);

  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));

  // 数据变化时回到第一页
  useEffect(() => {
    setPage(1);
  }, [data.length]);

  // 弹窗动画
  useEffect(() => {
    if (selected) {
      setMounted(false);
      requestAnimationFrame(() => setMounted(true));
    }
  }, [selected]);

  // ESC 关闭弹窗
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return data.slice(start, start + PAGE_SIZE);
  }, [data, page]);

  if (!data || data.length === 0) return null;

  const startIdx = (page - 1) * PAGE_SIZE;
  const pageStart = startIdx + 1;
  const pageEnd = Math.min(startIdx + PAGE_SIZE, data.length);

  // 弹窗内导航：上一条/下一条
  const selectedIndex = selected ? data.findIndex(
    (d) =>
      d.instruction === selected.instruction &&
      d.output === selected.output &&
      d.input === selected.input
  ) : -1;
  const goPrev = () => {
    if (selectedIndex > 0) setSelected(data[selectedIndex - 1]);
  };
  const goNext = () => {
    if (selectedIndex >= 0 && selectedIndex < data.length - 1)
      setSelected(data[selectedIndex + 1]);
  };

  return (
    <div className="animate-fade-in-up">
      <div className="apple-card overflow-hidden">
        {/* 表头 */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{
            background: "var(--bg-surface-secondary)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-6 h-6 rounded-[6px] flex items-center justify-center"
              style={{
                background: "var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <rect x="2" y="2" width="12" height="12" rx="2" />
                <path d="M5 6h6M5 9h4" strokeLinecap="round" />
              </svg>
            </div>
            <h3
              className="text-headline text-[15px]"
              style={{ color: "var(--text-primary)" }}
            >
              数据集预览
            </h3>
          </div>
          <span
            className="text-[12px] font-mono px-2.5 py-1 rounded-full"
            style={{
              background: "var(--bg-surface-tertiary)",
              color: "var(--text-secondary)",
            }}
          >
            共 {data.length} 条
          </span>
        </div>

        {/* 数据列表（单页 10 条） */}
        <div>
          {paged.map((entry, i) => {
            const globalIdx = startIdx + i;
            return (
              <button
                key={globalIdx}
                onClick={() => setSelected(entry)}
                className="w-full text-left px-6 py-4 transition-colors duration-300 ease-apple group block"
                style={{
                  borderBottom:
                    i < paged.length - 1
                      ? "1px solid var(--border-subtle)"
                      : "none",
                  background: "transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "var(--bg-surface-secondary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {/* 条目编号 + instruction */}
                <div className="flex items-start gap-3 mb-2">
                  <span
                    className="text-[12px] font-mono font-semibold flex-shrink-0 mt-0.5 w-7 text-right"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {String(globalIdx + 1).padStart(2, "0")}
                  </span>
                  <p
                    className="text-[14px] font-medium leading-snug flex-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {entry.instruction}
                  </p>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="var(--text-tertiary)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  >
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </div>

                {/* output 预览 */}
                <div className="flex items-start gap-3 ml-10">
                  <span
                    className="text-[12px] font-mono flex-shrink-0 mt-0.5"
                    style={{ color: "var(--success)" }}
                  >
                    output
                  </span>
                  <p
                    className="text-[13px] leading-relaxed flex-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {entry.output.length > 240
                      ? entry.output.slice(0, 240) + "…"
                      : entry.output}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* 分页控件 */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{
            background: "var(--bg-surface-secondary)",
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <span
            className="text-[12px] font-mono"
            style={{ color: "var(--text-tertiary)" }}
          >
            {pageStart}–{pageEnd} / {data.length}
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ease-apple disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105"
              style={{
                background: "var(--bg-surface-tertiary)",
                color: "var(--text-secondary)",
              }}
              aria-label="上一页"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 4l-4 4 4 4" />
              </svg>
            </button>

            {/* 页码数字 */}
            {renderPageNumbers(page, totalPages).map((p, idx) =>
              p === "…" ? (
                <span
                  key={`gap-${idx}`}
                  className="text-[12px] font-mono px-1"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  …
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-mono font-medium transition-all duration-300 ease-apple"
                  style={
                    page === p
                      ? {
                          background: "var(--accent)",
                          color: "#fff",
                        }
                      : {
                          background: "transparent",
                          color: "var(--text-secondary)",
                        }
                  }
                >
                  {p}
                </button>
              )
            )}

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ease-apple disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105"
              style={{
                background: "var(--bg-surface-tertiary)",
                color: "var(--text-secondary)",
              }}
              aria-label="下一页"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 4l4 4-4 4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 详情弹窗：居中、放大 */}
      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* 浅遮罩 */}
          <div
            onClick={() => setSelected(null)}
            className="absolute inset-0 transition-opacity duration-300 ease-apple"
            style={{
              background: "rgba(0, 0, 0, 0.12)",
              opacity: mounted ? 1 : 0,
            }}
          />
          {/* 弹窗：居中，放大到 max-w-3xl */}
          <div
            className="relative w-full max-w-3xl transition-all duration-300 ease-apple"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted
                ? "scale(1) translateY(0)"
                : "scale(0.96) translateY(12px)",
            }}
          >
            <div
              className="apple-card shadow-apple-xl overflow-hidden flex flex-col"
              style={{ maxHeight: "82vh" }}
            >
              {/* 弹窗头 */}
              <div
                className="flex items-center justify-between px-6 py-4 flex-shrink-0"
                style={{
                  background: "var(--bg-surface-secondary)",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="text-[12px] font-mono font-semibold px-2 py-1 rounded-full"
                    style={{
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                    }}
                  >
                    #{selectedIndex + 1}
                  </span>
                  <span
                    className="text-[13px] font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    数据详情
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={goPrev}
                    disabled={selectedIndex <= 0}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ease-apple disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105"
                    style={{
                      background: "var(--bg-surface-tertiary)",
                      color: "var(--text-secondary)",
                    }}
                    aria-label="上一条"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M10 4l-4 4 4 4" />
                    </svg>
                  </button>
                  <button
                    onClick={goNext}
                    disabled={selectedIndex >= data.length - 1}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ease-apple disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105"
                    style={{
                      background: "var(--bg-surface-tertiary)",
                      color: "var(--text-secondary)",
                    }}
                    aria-label="下一条"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 4l4 4-4 4" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setSelected(null)}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ease-apple hover:scale-110 ml-1"
                    style={{
                      background: "var(--bg-surface-tertiary)",
                      color: "var(--text-tertiary)",
                    }}
                    aria-label="关闭"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* 弹窗内容 — 字号放大 */}
              <div className="overflow-y-auto px-7 py-6 space-y-6">
                <DetailField
                  label="Instruction"
                  color="var(--accent)"
                  content={selected.instruction}
                />
                {selected.input && selected.input.trim().length > 0 && (
                  <DetailField
                    label="Input"
                    color="var(--warning)"
                    content={selected.input}
                  />
                )}
                <DetailField
                  label="Output"
                  color="var(--success)"
                  content={selected.output}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 详情字段块 — 字号放大 */
function DetailField({
  label,
  color,
  content,
}: {
  label: string;
  color: string;
  content: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: color }}
        />
        <span
          className="text-[13px] font-mono font-semibold uppercase tracking-wide"
          style={{ color }}
        >
          {label}
        </span>
      </div>
      <div
        className="rounded-[12px] px-5 py-4 text-[15px] leading-relaxed whitespace-pre-wrap break-words"
        style={{
          background: "var(--bg-surface-secondary)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {content || <span style={{ color: "var(--text-tertiary)" }}>（空）</span>}
      </div>
    </div>
  );
}

/**
 * 计算页码按钮：首页 + 末页 + 当前页前后 2 页，超出用 …
 */
function renderPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | string)[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) pages.push("…");
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}
