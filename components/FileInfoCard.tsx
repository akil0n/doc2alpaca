"use client";

interface FileInfoCardProps {
  fileName: string;
  fileSize: string;
  fileType: string;
  onRemove: () => void;
}

export function FileInfoCard({
  fileName,
  fileSize,
  fileType,
  onRemove,
}: FileInfoCardProps) {
  const iconBg =
    fileType === ".pdf"
      ? "linear-gradient(135deg, #FF9500, #FF6A00)"
      : fileType === ".pptx"
        ? "linear-gradient(135deg, #D6409F, #BF5AF2)"
        : fileType === ".md"
          ? "linear-gradient(135deg, var(--accent), var(--accent-highlight))"
          : "linear-gradient(135deg, #34C759, #30D158)";

  return (
    <div className="animate-fade-in-up delay-300">
      <div className="apple-card p-5 flex items-center gap-4">
        {/* 文件图标 */}
        <div
          className="w-12 h-12 rounded-[12px] flex items-center justify-center flex-shrink-0 shadow-apple-sm"
          style={{ background: iconBg }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
        </div>

        {/* 文件信息 */}
        <div className="flex-1 min-w-0">
          <p
            className="text-headline text-[15px] truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {fileName}
          </p>
          <div className="flex items-center gap-3 mt-0.5">
            <span
              className="text-[13px] font-mono"
              style={{ color: "var(--text-tertiary)" }}
            >
              {fileSize}
            </span>
            <span
              className="text-[12px] px-2 py-0.5 rounded-full font-medium"
              style={{
                background: "var(--bg-surface-tertiary)",
                color: "var(--text-secondary)",
              }}
            >
              {fileType}
            </span>
          </div>
        </div>

        {/* 删除按钮 */}
        <button
          onClick={onRemove}
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ease-apple hover:scale-110"
          style={{
            background: "var(--bg-surface-secondary)",
            color: "var(--text-tertiary)",
          }}
          aria-label="移除文件"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
