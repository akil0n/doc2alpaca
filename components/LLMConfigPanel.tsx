"use client";

import { useEffect, useState } from "react";
import { VENDORS } from "@/lib/llmConfigService";

interface LLMConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  baseUrl: string;
  model: string;
  onSave: (config: { apiKey: string; baseUrl: string; model: string }) => void;
}

// 根据 baseUrl 反推厂商 id（找不到则 custom）
function detectVendor(baseUrl: string): string {
  if (!baseUrl) return "custom";
  for (const v of VENDORS) {
    if (v.baseUrl === baseUrl) return v.id;
  }
  return "custom";
}

export function LLMConfigPanel({
  isOpen,
  onClose,
  apiKey,
  baseUrl,
  model,
  onSave,
}: LLMConfigPanelProps) {
  const [localApiKey, setLocalApiKey] = useState("");
  const [saveError, setSaveError] = useState("");
  const [localBaseUrl, setLocalBaseUrl] = useState(baseUrl);
  const [localModel, setLocalModel] = useState(model);
  const [vendorId, setVendorId] = useState(detectVendor(baseUrl));
  const [mounted, setMounted] = useState(false);
  const [saved, setSaved] = useState(false);

  // 外部 prop 变化时同步
  useEffect(() => {
    setLocalApiKey("");
    setLocalBaseUrl(baseUrl);
    setLocalModel(model);
    setVendorId(detectVendor(baseUrl));
  }, [apiKey, baseUrl, model]);

  useEffect(() => {
    if (isOpen) {
      setMounted(false);
      setSaved(false);
      requestAnimationFrame(() => setMounted(true));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVendorChange = (id: string) => {
    setVendorId(id);
    const v = VENDORS.find((x) => x.id === id);
    if (v?.baseUrl) setLocalBaseUrl(v.baseUrl);
    if (v && v.models.length > 0) setLocalModel(v.models[0]);
  };

  const handleSave = async () => {
    setSaveError("");
    const response = await fetch("/api/me/llm-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorId,
        apiKey: localApiKey || undefined,
        baseUrl: localBaseUrl,
        model: localModel,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSaveError(data.error || "保存失败");
      return;
    }
    setLocalApiKey("");
    onSave({ apiKey: "stored", baseUrl: data.baseUrl, model: data.model });
    setSaved(true);
    setTimeout(() => onClose(), 700);
  };

  const selectClass =
    "w-full px-4 py-2.5 rounded-[10px] text-[14px] outline-none transition-all duration-300 ease-apple appearance-none cursor-pointer";
  const selectStyle: React.CSSProperties = {
    background: "var(--bg-surface-secondary)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16' fill='none' stroke='%2386868B' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    paddingRight: "36px",
  };
  const inputClass =
    "w-full px-4 py-2.5 rounded-[10px] text-[14px] outline-none transition-all duration-300 ease-apple font-mono";
  const inputStyle: React.CSSProperties = {
    background: "var(--bg-surface-secondary)",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
  };
  const focusProps = {
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.style.borderColor = "var(--accent)";
      e.target.style.boxShadow = "0 0 0 3px var(--accent-soft)";
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.style.borderColor = "var(--border-default)";
      e.target.style.boxShadow = "none";
    },
  };

  const currentVendor = VENDORS.find((v) => v.id === vendorId);

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
        className="relative w-full max-w-md transition-all duration-500 ease-apple"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted
            ? "scale(1) translateY(0)"
            : "scale(0.95) translateY(20px)",
        }}
      >
        <div
          className="apple-card shadow-apple-xl overflow-hidden"
          style={{ padding: "32px" }}
        >
          {/* 标题 */}
          <div className="flex items-center justify-between mb-6">
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
                >
                  <path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5L8 1z" />
                </svg>
              </div>
              <h2
                className="text-headline text-xl"
                style={{ color: "var(--text-primary)" }}
              >
                LLM 配置
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ease-apple hover:scale-110"
              style={{
                background: "var(--bg-surface-secondary)",
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

          {/* 持久化提示 */}
          <div
            className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-[10px] mb-5"
            style={{
              background: "var(--accent-soft)",
              border: "1px solid transparent",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.6"
              className="flex-shrink-0 mt-0.5"
            >
              <path
                d="M3 7a5 5 0 0110 0v3l1.5 2H1.5L3 10V7z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M6 13a2 2 0 004 0" strokeLinecap="round" />
            </svg>
            <p
              className="text-[12px] leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              API Key 使用服务端 AES-256-GCM 加密保存；页面和接口永不返回完整密钥。
            </p>
          </div>

          {/* 表单 */}
          <div className="space-y-5">
            {/* 厂商选择 */}
            <div>
              <label
                className="text-[13px] font-medium block mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                服务商
              </label>
              <select
                value={vendorId}
                onChange={(e) => handleVendorChange(e.target.value)}
                className={selectClass}
                style={selectStyle}
              >
                {VENDORS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 模型选择 — 自定义时变为输入框 */}
            <div>
              <label
                className="text-[13px] font-medium block mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                模型
              </label>
              {currentVendor && currentVendor.models.length > 0 ? (
                <select
                  value={localModel}
                  onChange={(e) => setLocalModel(e.target.value)}
                  className={selectClass}
                  style={selectStyle}
                >
                  {currentVendor.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={localModel}
                  onChange={(e) => setLocalModel(e.target.value)}
                  placeholder="输入模型 ID"
                  className={inputClass}
                  style={inputStyle}
                  {...focusProps}
                />
              )}
            </div>

            {/* Base URL — 可自填 */}
            <div>
              <label
                className="text-[13px] font-medium block mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Base URL
              </label>
              <input
                type="text"
                value={localBaseUrl}
                placeholder="https://api.openai.com/v1"
                readOnly
                className={inputClass}
                style={inputStyle}
                {...focusProps}
              />
            </div>

            {/* API Key */}
            <div>
              <label
                className="text-[13px] font-medium block mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                API Key
              </label>
              <input
                type="password"
                value={localApiKey}
                onChange={(e) => setLocalApiKey(e.target.value)}
                placeholder={apiKey ? "已加密保存；留空表示保持不变" : "sk-..."}
                className={inputClass}
                style={inputStyle}
                {...focusProps}
              />
            </div>
          </div>

          {saveError && <p className="mt-4 text-[12px]" style={{ color: "var(--error)" }}>{saveError}</p>}

          {/* 操作按钮 */}
          <div className="flex items-center gap-3 mt-7">
            <button
              onClick={onClose}
              className="btn-ghost flex-1 py-2.5 text-[14px] font-medium"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="btn-apple flex-1 py-2.5 text-[14px] inline-flex items-center justify-center gap-1.5"
            >
              {saved ? (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M13 4L6 11l-3-3" />
                  </svg>
                  已保存
                </>
              ) : (
                "保存"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
