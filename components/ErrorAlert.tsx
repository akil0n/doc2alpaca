"use client";

import { useEffect, useState } from "react";

interface ErrorAlertProps {
  message: string;
  onClose: () => void;
}

export function ErrorAlert({ message, onClose }: ErrorAlertProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      className="overflow-hidden transition-all duration-500 ease-apple"
      style={{
        maxHeight: visible ? "200px" : "0",
        opacity: visible ? 1 : 0,
        marginBottom: visible ? "0" : "-16px",
      }}
    >
      <div
        className="apple-card flex items-start gap-3 p-4"
        style={{
          borderColor: "var(--error)",
          background: "var(--error-soft)",
        }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--error)" }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </div>
        <p
          className="flex-1 text-[14px] font-medium pt-0.5"
          style={{ color: "var(--text-primary)" }}
        >
          {message}
        </p>
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(onClose, 300);
          }}
          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ease-apple hover:scale-110"
          style={{
            color: "var(--text-tertiary)",
          }}
          aria-label="关闭"
        >
          <svg
            width="12"
            height="12"
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
  );
}
