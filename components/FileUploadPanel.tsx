"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";

interface FileUploadPanelProps {
  onFileSelect: (file: File) => void;
  /** 批量选择文件回调（可选） */
  onFilesSelect?: (files: File[]) => void;
  /** 是否启用批量模式 */
  batchMode?: boolean;
}

export function FileUploadPanel({ onFileSelect, onFilesSelect, batchMode = false }: FileUploadPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      ALLOWED_TYPES.includes(f.name.slice(f.name.lastIndexOf(".")).toLowerCase())
    );
    if (files.length === 0) return;
    if (batchMode && onFilesSelect) {
      onFilesSelect(files);
    } else {
      onFileSelect(files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    if (batchMode && onFilesSelect) {
      onFilesSelect(files);
    } else {
      onFileSelect(files[0]);
    }
    // 清空 input 值，允许重复选择同一文件
    e.target.value = "";
  };

  return (
    <div className="upload-stage animate-scale-in delay-200">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="upload-surface relative apple-card apple-card-hover cursor-pointer overflow-hidden group"
        style={{
          padding: "64px 40px",
          textAlign: "center",
          borderColor: isDragging ? "var(--accent)" : undefined,
          background: isDragging
            ? "var(--accent-soft)"
            : "var(--bg-surface)",
          transform: isDragging ? "scale(1.01)" : undefined,
        }}
      >
        {/* 背景光晕 */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-apple pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 50% 40%, var(--accent-soft), transparent 70%)",
          }}
        />

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.pptx,.txt,.md,.markdown,.html,.htm"
          multiple={batchMode}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* 上传图标 */}
        <div className="relative flex flex-col items-center gap-5">
          <div
            className="upload-icon w-16 h-16 rounded-[18px] flex items-center justify-center transition-all duration-500 ease-apple group-hover:scale-110 group-hover:rotate-3"
            style={{
              background: isDragging
                ? "var(--accent)"
                : "var(--bg-surface-secondary)",
              color: isDragging
                ? "#fff"
                : "var(--accent)",
              boxShadow: isDragging
                ? "0 8px 24px var(--accent-soft)"
                : "none",
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 15V3" />
              <path d="M7 8l5-5 5 5" />
              <path d="M5 21h14" />
            </svg>
          </div>

          <div className="space-y-1.5">
            <p
              className="text-headline text-xl"
              style={{ color: "var(--text-primary)" }}
            >
              {isDragging
                ? batchMode
                  ? "释放以上传文件（支持多选）"
                  : "释放以上传文件"
                : batchMode
                  ? "拖放文件到此处（支持批量）"
                  : "拖放文件到此处"}
            </p>
            <p
              className="text-body text-[15px]"
              style={{ color: "var(--text-secondary)" }}
            >
              {batchMode ? "或点击此区域批量选择文件" : "或点击此区域选择文件"}
            </p>
          </div>

          {/* 格式标签 */}
          <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
            {["PDF", "DOCX", "PPTX", "TXT", "MD", "HTML"].map((fmt) => (
              <span
                key={fmt}
                className="format-chip px-3 py-1 text-[12px] font-mono font-medium rounded-full transition-colors duration-300"
                style={{
                  background: "var(--bg-surface-tertiary)",
                  color: "var(--text-tertiary)",
                }}
              >
                {fmt}
              </span>
            ))}
          </div>

          <p
            className="max-w-2xl text-[12px] leading-relaxed"
            style={{ color: "var(--text-tertiary)" }}
          >
            文档内容会发送给你选择的 LLM 服务商进行处理；第三方是否留存内容取决于其数据协议。
          </p>

          {/* 批量模式提示 */}
          {batchMode && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium"
              style={{
                background: "var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="14" height="10" rx="1.5" />
                <path d="M4 4V2.5a1 1 0 011-1h6a1 1 0 011 1V4" />
              </svg>
              <span>批量导入模式 — 可一次选择多个文件</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 允许的文件扩展名 */
const ALLOWED_TYPES = [
  ".pdf", ".docx", ".pptx",
  ".txt", ".md", ".markdown",
  ".html", ".htm",
];
