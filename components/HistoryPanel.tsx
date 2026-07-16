"use client";

import { useEffect, useState } from "react";
import type { HistoryRecord } from "@/types";
import {
  getHistory,
  deleteHistory,
  clearHistory,
} from "@/lib/historyService";

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (record: HistoryRecord) => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf: "var(--error)",
  docx: "var(--accent)",
  txt: "var(--text-secondary)",
  md: "var(--success)",
  html: "var(--warning)",
};

export function HistoryPanel({ isOpen, onClose, onLoad }: HistoryPanelProps) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [mounted, setMounted] = useState(false);

  // 打开时刷新
  useEffect(() => {
    if (isOpen) {
      setRecords(getHistory());
      setMounted(false);
      requestAnimationFrame(() => setMounted(true));
    }
  }, [isOpen]);

  // ESC 关闭
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDelete = (id: string) => {
    deleteHistory(id);
    setRecords(getHistory());
  };

  const handleClearAll = () => {
    clearHistory();
    setRecords([]);
  };

  const handleLoad = (record: HistoryRecord) => {
    onLoad(record);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div
        onClick={onClose}
        className="absolute inset-0 transition-all duration-500 ease-apple"
        style={{
          background: "rgba(0, 0, 0, 0.4)",
          opacity: mounted ? 1 : 0,
          backdropFilter: "blur(8px)",
        }}
      />

      {/* 模态框 */}
      <div
        className="relative w-full max-w-2xl transition-all duration-500 ease-apple"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted
            ? "scale(1) translateY(0)"
            : "scale(0.96) translateY(16px)",
        }}
      >
        <div
          className="apple-card shadow-apple-xl overflow-hidden flex flex-col"
          style={{ maxHeight: "80vh" }}
        >
          {/* 头部 */}
          <div
            className="flex items-center justify-between px-6 py-4 flex-shrink-0"
            style={{
              background: "var(--bg-surface-secondary)",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                style={{
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="8" cy="8" r="6.5" />
                  <path d="M8 4v4l2.5 1.5" />
                </svg>
              </div>
              <div>
                <h2
                  className="text-headline text-[17px]"
                  style={{ color: "var(--text-primary)" }}
                >
                  历史分析记录
                </h2>
                <p
                  className="text-[12px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  保存在本机浏览器，最多 50 条
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {records.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-300 ease-apple"
                  style={{
                    background: "var(--error-soft)",
                    color: "var(--error)",
                  }}
                >
                  清空全部
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ease-apple hover:scale-110"
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

          {/* 列表 / 空状态 */}
          <div className="overflow-y-auto flex-1">
            {records.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-6">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                  style={{ background: "var(--bg-surface-secondary)" }}
                >
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="var(--text-tertiary)"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="8" cy="8" r="6.5" />
                    <path d="M8 4v4l2.5 1.5" />
                  </svg>
                </div>
                <p
                  className="text-[15px] font-medium mb-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  暂无历史记录
                </p>
                <p
                  className="text-[13px] text-center"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  完成一次文档转换后，
                  <br />
                  解析结果会自动保存在这里。
                </p>
              </div>
            ) : (
              <div>
                {records.map((record, i) => {
                  const ext = record.fileType.replace(/^\./, "");
                  const color = FILE_TYPE_COLORS[ext] || "var(--text-secondary)";
                  return (
                    <div
                      key={record.id}
                      className="group px-6 py-4 transition-colors duration-300 ease-apple"
                      style={{
                        borderBottom:
                          i < records.length - 1
                            ? "1px solid var(--border-subtle)"
                            : "none",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "var(--bg-surface-secondary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div className="flex items-center gap-3">
                        {/* 文件类型图标 */}
                        <div
                          className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
                          style={{ background: `${color}18` }}
                        >
                          <span
                            className="text-[10px] font-mono font-bold uppercase"
                            style={{ color }}
                          >
                            {ext.slice(0, 4)}
                          </span>
                        </div>

                        {/* 文件信息 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p
                              className="text-[14px] font-medium truncate"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {record.fileName}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className="text-[12px] font-mono"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              {formatTime(record.createdAt)}
                            </span>
                            <span
                              className="text-[12px] font-mono px-2 py-0.5 rounded-full"
                              style={{
                                background: "var(--success-soft)",
                                color: "var(--success)",
                              }}
                            >
                              {record.itemCount} 条
                            </span>
                          </div>
                        </div>

                        {/* 操作 */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleLoad(record)}
                            className="px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all duration-300 ease-apple hover:scale-105"
                            style={{
                              background: "var(--accent)",
                              color: "#fff",
                            }}
                          >
                            查看
                          </button>
                          <button
                            onClick={() => handleDelete(record.id)}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ease-apple hover:scale-110"
                            style={{
                              background: "var(--bg-surface-tertiary)",
                              color: "var(--text-tertiary)",
                            }}
                            aria-label="删除"
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
                              <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9h5L11 4" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
