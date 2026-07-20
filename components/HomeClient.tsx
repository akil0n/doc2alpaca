"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { FileUploadPanel } from "@/components/FileUploadPanel";
import { FileInfoCard } from "@/components/FileInfoCard";
import { DatasetWorkbench } from "@/components/DatasetWorkbench";
import { ErrorAlert } from "@/components/ErrorAlert";
import { LLMConfigPanel } from "@/components/LLMConfigPanel";
import { HistoryPanel } from "@/components/HistoryPanel";
import type {
  AlpacaItem,
  FileMeta,
  ExportFormat,
  HistoryRecord,
  BatchFileInfo,
  BatchResult,
} from "@/types";
import { downloadAsJson, formatJson } from "@/lib/exportService";
import { getHistory } from "@/lib/historyService";
import { clearLegacyPersistedConfig } from "@/lib/llmConfigService";

type Stage = "idle" | "processing" | "done" | "error";
type Mode = "single" | "batch";

// 解析等待期间轮播的趣味文案
const FUN_MESSAGES = [
  "正在和文档里的每一个知识点打招呼…",
  "AI 正在认真阅读，连标点符号都不放过",
  "知识颗粒正在被精准拆分中",
  "正在把厚文档变成薄薄的高质量数据集",
  "AI 正在搬运知识砖块，请稍候片刻",
  "距离完成又近了一步，喝口水歇会儿吧 ☕",
  "正在为你打磨每一条问答的措辞",
  "AI 在思考文档，顺便思考了一下人生",
  "分块、提取、去重，三步走一个都不能少",
  "好的训练数据值得多花一点时间",
  "正在交叉比对知识点，避免重复",
  "把碎片化的信息重新组织成清晰的问答",
];

/** 解析一段 SSE 文本块 */
function parseSSE(raw: string): { event: string; data: any } | null {
  const lines = raw.split("\n");
  let event = "message";
  let dataStr = "";
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
  }
  if (!dataStr) return null;
  try {
    return { event, data: JSON.parse(dataStr) };
  } catch {
    return null;
  }
}

export default function HomeClient({ currentUser }: { currentUser: { name: string; image?: string | null } }) {
  // ---- 通用状态 ----
  const [mode, setMode] = useState<Mode>("single");
  const [errorMsg, setErrorMsg] = useState("");
  const [showError, setShowError] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("alpaca");
  const [llmConfig, setLlmConfig] = useState({
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
  });
  const [envHasApiKey, setEnvHasApiKey] = useState(false);

  // ---- 单文件状态 ----
  const [file, setFile] = useState<File | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [stepLabel, setStepLabel] = useState("");
  const [dataset, setDataset] = useState<AlpacaItem[]>([]);
  const [downloadName, setDownloadName] = useState("");
  const [chunksDone, setChunksDone] = useState(0);
  const [chunksTotal, setChunksTotal] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [analysisStart, setAnalysisStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [funIdx, setFunIdx] = useState(0);

  // ---- 批量状态 ----
  const [batchFiles, setBatchFiles] = useState<BatchFileInfo[]>([]);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(-1);
  const [batchStage, setBatchStage] = useState<Stage>("idle");
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const isBatchProcessingRef = useRef(false);

  // 启动时：读取当前用户的加密配置和生成历史
  useEffect(() => {
    clearLegacyPersistedConfig();

    fetch("/api/me/llm-config")
      .then((r) => r.json())
      .then((config) => {
        setEnvHasApiKey(Boolean(config.configured));
        setLlmConfig({
          apiKey: config.configured ? "stored" : "",
          baseUrl: config.baseUrl || "https://api.openai.com/v1",
          model: config.model || "gpt-4o",
        });
      })
      .catch(() => {});

    getHistory()
      .then((records) => setHistoryCount(records.length))
      .catch(() => {});

    const cleanup = window.electronApp?.onMenuBatchImport?.(async () => {
      setMode("batch");
      const filePaths = await window.electronApp?.openFileDialog?.();
      if (filePaths && filePaths.length > 0) {
        const fileDataList = await window.electronApp?.readFilesByPaths?.(filePaths);
        if (fileDataList && fileDataList.length > 0) {
          const files = fileDataList.map((fd: any) => {
            const byteChars = atob(fd.data);
            const byteArray = new Uint8Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
            return new File([byteArray], fd.name, { type: fd.mime });
          });
          handleBatchFilesSelect(files);
        }
      }
    });
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, []);

  // 单文件解析过程中：每秒刷新已用时间
  useEffect(() => {
    if (stage !== "processing" || !analysisStart) return;
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - analysisStart) / 1000)),
      1000
    );
    return () => clearInterval(t);
  }, [stage, analysisStart]);

  // 单文件解析过程中：每 4 秒轮播趣味文案
  useEffect(() => {
    if (stage !== "processing") return;
    const t = setInterval(() => setFunIdx((i) => (i + 1) % FUN_MESSAGES.length), 4000);
    return () => clearInterval(t);
  }, [stage]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  };

  const getFileType = (name: string) => {
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    if (ext === ".pdf") return ".pdf";
    if (ext === ".docx") return ".docx";
    if (ext === ".pptx" || ext === ".ppt") return ".pptx";
    if (ext === ".md" || ext === ".markdown") return ".md";
    if (ext === ".html" || ext === ".htm") return ".html";
    return ".txt";
  };

  // 默认下载文件名
  const defaultDownloadName = () => {
    if (!sourceName)
      return exportFormat === "sharegpt"
        ? "sharegpt_dataset.json"
        : "alpaca_dataset.json";
    const base = sourceName.replace(/\.[^.]+$/, "");
    return `${base}_${exportFormat}.json`;
  };

  // ========== 单文件操作 ==========

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setSourceName(selectedFile.name);
    setStage("idle");
    setProgress(0);
    setDataset([]);
    setDownloadName("");
    setExportFormat("alpaca");
  };

  const handleRemoveFile = () => {
    setFile(null);
    setSourceName("");
    setStage("idle");
    setProgress(0);
    setDataset([]);
  };

  // 预估剩余时间（秒）
  const eta =
    chunksDone > 0 && chunksTotal > 1
      ? Math.max(0, Math.round((elapsed / chunksDone) * (chunksTotal - chunksDone)))
      : null;

  const handleStart = useCallback(async () => {
    if (!file) return;
    setStage("processing");
    setProgress(6);
    setStepLabel("上传文件…");
    setShowError(false);
    setChunksDone(0);
    setChunksTotal(0);
    setTotalItems(0);
    setElapsed(0);
    setFunIdx(0);
    setAnalysisStart(Date.now());

    try {
      // Step 1: 上传文件
      const formData = new FormData();
      formData.append("file", file);

      const uploadResp = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadResp.ok) {
        const err = await uploadResp.json().catch(() => ({}));
        throw new Error(err.error || "文件上传失败");
      }

      const meta: FileMeta = await uploadResp.json();
      setProgress(12);
      setStepLabel("正在提取文档文本…");

      // Step 2: SSE 全覆盖提取
const resp = await fetch("/api/analyze/full-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId: meta.uploadId,
          sessionId: `extract_${file.name}_${file.size}_${file.lastModified}`,
}),
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || "分析请求失败");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalItems: AlpacaItem[] = [];
      let failedChunks = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const evt = parseSSE(part);
          if (!evt) continue;

          if (evt.event === "error") {
            throw new Error(evt.data.message || "分析失败");
          } else if (evt.event === "init") {
            setProgress(15);
            setStepLabel("文本提取完成，开始分块解析…");
          } else if (evt.event === "chunk") {
            const p = evt.data;
            setChunksDone(p.done);
            setChunksTotal(p.total);
            setTotalItems(p.totalItems);
            const pct = 15 + Math.round((p.done / p.total) * 70);
            setProgress(pct);
            setStepLabel(
              `正在解析第 ${p.done} / ${p.total} 块 · 已生成 ${p.totalItems} 条`
            );
          } else if (evt.event === "dedup") {
            const p = evt.data;
            setProgress(90);
            setStepLabel(`正在全局去重：${p.before} → ${p.after} 条`);
          } else if (evt.event === "done") {
            failedChunks = evt.data.failedChunks || 0;
            setProgress(95);
            setStepLabel(failedChunks > 0 ? `已保留结果，${failedChunks} 个分块等待重试` : "整理结果中…");
          } else if (evt.event === "data") {
            finalItems = evt.data.items || [];
          }
        }
      }

      setDataset(finalItems);
      if (failedChunks > 0) {
        setErrorMsg(`本次有 ${failedChunks} 个分块处理失败，已保存成功结果和断点；再次转换同一文件会继续处理。`);
        setShowError(true);
      }

      setProgress(100);
      setStepLabel("完成");

      try {
        setHistoryCount((await getHistory()).length);
      } catch {
        // 静默处理
      }

      setTimeout(() => setStage("done"), 400);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "未知错误");
      setShowError(true);
      setStage("error");
    }
  }, [file]);

  const handleDownload = () => {
    const name = (downloadName || defaultDownloadName()).trim();
    const finalName = /\.json$/i.test(name) ? name : `${name}.json`;
    downloadAsJson(dataset, exportFormat, finalName);
  };

  const handleLoadHistory = (record: HistoryRecord) => {
    setDataset(record.items);
    setFile(null);
    setSourceName(record.fileName);
    setMode("single");
    setStage("done");
    setProgress(100);
    setDownloadName("");
    setExportFormat("alpaca");
  };

  // ========== 批量操作 ==========

  /** 批量选择文件回调 */
  const handleBatchFilesSelect = (files: File[]) => {
    const infoList: BatchFileInfo[] = files.map((f) => ({
      file: f,
      status: "pending",
      progress: 0,
      stepLabel: "等待处理",
      items: [],
      chunksDone: 0,
      chunksTotal: 0,
      totalItems: 0,
    }));
    setBatchFiles(infoList);
    setBatchStage("idle");
    setBatchResult(null);
    setShowError(false);
  };

  /** 移除批量列表中的文件 */
  const handleRemoveBatchFile = (index: number) => {
    setBatchFiles((prev) => prev.filter((_, i) => i !== index));
  };

  /** 清空批量列表 */
  const handleClearBatchFiles = () => {
    setBatchFiles([]);
    setBatchStage("idle");
    setBatchResult(null);
  };

  /** 开始批量处理 */
  const handleStartBatch = useCallback(async () => {
    if (batchFiles.length === 0 || isBatchProcessingRef.current) return;

    isBatchProcessingRef.current = true;
    setBatchStage("processing");
    setShowError(false);

    const updated = batchFiles.map((bf) => ({
      ...bf,
      status: "pending" as const,
      progress: 0,
      stepLabel: "等待处理",
      items: [],
      error: undefined,
    }));
    setBatchFiles(updated);

    const results: BatchResult["files"] = [];
    let hasError = false;

    for (let i = 0; i < updated.length; i++) {
      if (!isBatchProcessingRef.current) break; // 允许中断

      setCurrentBatchIndex(i);

      // 更新当前文件状态为 uploading
      setBatchFiles((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], status: "uploading", progress: 5, stepLabel: "上传文件中…" };
        return next;
      });

      try {
        const bf = updated[i];

        // Step 1: 上传文件
        const formData = new FormData();
        formData.append("file", bf.file);

        const uploadResp = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadResp.ok) {
          const err = await uploadResp.json().catch(() => ({}));
          throw new Error(err.error || "文件上传失败");
        }

        const meta: FileMeta = await uploadResp.json();

        // 更新状态 -> processing
        setBatchFiles((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            status: "processing",
            progress: 12,
            stepLabel: "正在提取文档文本…",
            meta,
          };
          return next;
        });

        // Step 2: SSE 全覆盖提取
const resp = await fetch("/api/analyze/full-extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uploadId: meta.uploadId,
sessionId: `extract_${bf.file.name}_${bf.file.size}_${bf.file.lastModified}`,
          }),
        });

        if (!resp.ok || !resp.body) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error?.message || "分析请求失败");
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalItems: AlpacaItem[] = [];

        let failedChunks = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const evt = parseSSE(part);
            if (!evt) continue;

            if (evt.event === "error") {
              throw new Error(evt.data.message || "分析失败");
            } else if (evt.event === "chunk") {
              const p = evt.data;
              const pct = 15 + Math.round((p.done / p.total) * 70);
              setBatchFiles((prev) => {
                const next = [...prev];
                next[i] = {
                  ...next[i],
                  progress: pct,
                  stepLabel: `正在解析第 ${p.done}/${p.total} 块 · 已生成 ${p.totalItems} 条`,
                  chunksDone: p.done,
                  chunksTotal: p.total,
                  totalItems: p.totalItems,
                };
                return next;
              });
            } else if (evt.event === "dedup") {
              const p = evt.data;
              setBatchFiles((prev) => {
                const next = [...prev];
                next[i] = {
                  ...next[i],
                  progress: 90,
                  stepLabel: `正在去重：${p.before} → ${p.after} 条`,
                };
                return next;
              });
            } else if (evt.event === "done") {
              failedChunks = evt.data.failedChunks || 0;
            } else if (evt.event === "data") {
              finalItems = evt.data.items || [];
            }
          }
        }

        // 完成当前文件
        setBatchFiles((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            status: "done",
            progress: 100,
            stepLabel: failedChunks > 0 ? `部分完成 · ${failedChunks} 块待重试` : "完成",
            items: finalItems,
            totalItems: finalItems.length,
          };
          return next;
        });

        // 保存到历史记录
        try {
          setHistoryCount((await getHistory()).length);
        } catch {
          // 静默处理
        }

        results.push({
          fileName: meta.fileName,
          fileType: meta.fileType,
          status: "done",
          items: finalItems,
          itemCount: finalItems.length,
        });
      } catch (e) {
        hasError = true;
        const msg = e instanceof Error ? e.message : "未知错误";
        setBatchFiles((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            status: "error",
            progress: 0,
            stepLabel: "处理失败",
            error: msg,
          };
          return next;
        });
        results.push({
          fileName: batchFiles[i]?.file.name || `文件 ${i + 1}`,
          fileType: getFileType(batchFiles[i]?.file.name || ""),
          status: "error",
          items: [],
          itemCount: 0,
          error: msg,
        });
      }
    }

    // 收集最终结果
    const allItems = results
      .filter((r) => r.status === "done")
      .flatMap((r) => r.items);

    const result: BatchResult = {
      totalFiles: results.length,
      successFiles: results.filter((r) => r.status === "done").length,
      failedFiles: results.filter((r) => r.status === "error").length,
      totalItems: allItems.length,
      files: results,
    };
    setBatchResult(result);
    setCurrentBatchIndex(-1);
    isBatchProcessingRef.current = false;
    setTimeout(() => setBatchStage("done"), 400);
  }, [batchFiles]);

  /** 中断批量处理 */
  const handleAbortBatch = () => {
    isBatchProcessingRef.current = false;
    setBatchStage("idle");
    setCurrentBatchIndex(-1);
  };

  /** 下载批量结果（合并所有成功文件） */
  const handleDownloadBatchCombined = () => {
    if (!batchResult) return;
    const allItems = batchResult.files
      .filter((f) => f.status === "done")
      .flatMap((f) => f.items);
    const name = `batch_combined_${exportFormat}.json`;
    downloadAsJson(allItems, exportFormat, name);
  };

  /** 下载批量结果（分别下载每个文件） */
  const handleDownloadBatchSeparate = () => {
    if (!batchResult) return;
    batchResult.files
      .filter((f) => f.status === "done" && f.items.some(
        (item) => !("reviewStatus" in item) || item.reviewStatus === "accepted"
      ))
      .forEach((f) => {
        const base = f.fileName.replace(/\.[^.]+$/, "");
        const name = `${base}_${exportFormat}.json`;
        downloadAsJson(f.items, exportFormat, name);
      });
  };

  // ========== 渲染判断 ==========

  const isSingleFileView = mode === "single";
  const isBatchView = mode === "batch";

  // 批量处理中，正在处理的文件索引
  const processingIdx = currentBatchIndex;

  return (
    <div className="app-shell min-h-screen relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="fixed inset-0 bg-grid pointer-events-none" />
      <div
        className="fixed -top-[200px] -right-[200px] w-[600px] h-[600px] rounded-full pointer-events-none transition-opacity duration-1000"
        style={{
          background: "radial-gradient(circle, var(--accent-soft), transparent 60%)",
          opacity: stage === "idle" && !file && !batchFiles.length ? 0.6 : 0.3,
        }}
      />
      <div
        className="fixed -bottom-[200px] -left-[200px] w-[500px] h-[500px] rounded-full pointer-events-none transition-opacity duration-1000"
        style={{
          background: "radial-gradient(circle, var(--success-soft), transparent 60%)",
          opacity: 0.4,
        }}
      />

      <PageHeader
        onOpenConfig={() => setConfigOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        configReady={envHasApiKey}
        historyCount={historyCount}
        userName={currentUser.name}
        userImage={currentUser.image}
      />

      <main className="app-main relative mx-auto max-w-6xl px-6 pt-28 pb-16">
        {/* ---- Hero 区 ---- */}
        <section className="app-hero text-center mb-10 max-w-2xl mx-auto">
          {batchStage === "done" && batchResult ? (
            <>
              <div className="animate-fade-in-down flex justify-center mb-3">
                <span
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-medium"
                  style={{ background: "var(--success-soft)", color: "var(--success)" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse-soft" />
                  批量转换完成
                </span>
              </div>
              <h1 className="animate-fade-in-up delay-100">
                <span
                  className="text-display block text-[32px] md:text-[40px]"
                  style={{ color: "var(--text-primary)" }}
                >
                  处理完成
                </span>
              </h1>
              <p
                className="animate-fade-in-up delay-200 text-body text-[15px] mt-2"
                style={{ color: "var(--text-secondary)" }}
              >
                共处理 {batchResult.totalFiles} 个文件，成功 {batchResult.successFiles} 个，
                失败 {batchResult.failedFiles} 个，生成 {batchResult.totalItems} 条数据
              </p>
            </>
          ) : stage === "done" && dataset.length > 0 ? (
            <>
              <div className="animate-fade-in-down flex justify-center mb-3">
                <span
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-medium"
                  style={{ background: "var(--success-soft)", color: "var(--success)" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse-soft" />
                  转换完成
                </span>
              </div>
              <h1 className="animate-fade-in-up delay-100">
                <span
                  className="text-display block text-[32px] md:text-[40px]"
                  style={{ color: "var(--text-primary)" }}
                >
                  转换完成
                </span>
              </h1>
              <p
                className="animate-fade-in-up delay-200 text-body text-[15px] mt-2"
                style={{ color: "var(--text-secondary)" }}
              >
                成功生成 {dataset.length} 条 {exportFormat === "sharegpt" ? "ShareGPT" : "Alpaca"} 格式数据
              </p>
            </>
          ) : (
            <>
              <div className="animate-fade-in-down flex justify-center mb-4">
                <span
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-medium"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse-soft" />
                  AI 驱动的文档转换工具
                </span>
              </div>

              <h1 className="animate-fade-in-up delay-100">
                <span
                  className="text-display block text-[40px] md:text-[54px]"
                  style={{ color: "var(--text-primary)" }}
                >
                  将文档转化为
                </span>
                <span
                  className="hero-accent-text text-display block text-[40px] md:text-[54px] mt-0.5"
                  style={{
                    background: "linear-gradient(135deg, var(--accent), var(--accent-highlight))",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Alpaca 数据集
                </span>
              </h1>

              <p
                className="animate-fade-in-up delay-200 text-body text-[16px] md:text-[17px] mt-4 max-w-xl mx-auto"
                style={{ color: "var(--text-secondary)" }}
              >
                上传你的文档，AI 自动拆解并生成高质量的
                <br />
                Alpaca / ShareGPT 格式训练数据，就这般简单。
              </p>
            </>
          )}
        </section>

        {/* ---- 模式切换（仅 idle 时显示） ---- */}
        {!file && stage === "idle" && batchFiles.length === 0 && batchStage !== "processing" && batchStage !== "done" && (
          <div className="mode-switch-wrap flex justify-center mb-6 animate-fade-in-up delay-150">
            <div
              className="mode-switch inline-flex p-1 rounded-full"
              style={{ background: "var(--bg-surface-secondary)" }}
            >
              {(["single", "batch"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); handleClearBatchFiles(); handleRemoveFile(); }}
                  className="px-5 py-2 rounded-full text-[13px] font-medium transition-all duration-300 ease-apple flex items-center gap-1.5"
                  style={
                    mode === m
                      ? {
                          background: "var(--accent)",
                          color: "#fff",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                        }
                      : {
                          background: "transparent",
                          color: "var(--text-secondary)",
                        }
                  }
                >
                  {m === "single" ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 7a3 3 0 100-6 3 3 0 000 6zM2 14v-1a4 4 0 014-4h4a4 4 0 014 4v1" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="4" width="14" height="10" rx="1.5" />
                      <path d="M4 4V2.5a1 1 0 011-1h6a1 1 0 011 1V4" />
                    </svg>
                  )}
                  {m === "single" ? "单文件模式" : "批量模式"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---- 错误提示 ---- */}
        {showError && (
          <div className="mb-6">
            <ErrorAlert message={errorMsg} onClose={() => setShowError(false)} />
          </div>
        )}

        {/* ============================================================ */}
        {/*                  单文件模式                                     */}
        {/* ============================================================ */}
        {isSingleFileView && (
          <>
            {/* 单文件上传区 */}
            {!file && stage !== "done" && (
              <FileUploadPanel onFileSelect={handleFileSelect} batchMode={false} />
            )}

            {/* 单文件信息卡 */}
            {file && stage !== "done" && (
              <div className="space-y-6">
                <FileInfoCard
                  fileName={file.name}
                  fileSize={formatFileSize(file.size)}
                  fileType={getFileType(file.name)}
                  onRemove={handleRemoveFile}
                />

                {stage === "processing" && (
                  <SingleProgress
                    progress={progress}
                    stepLabel={stepLabel}
                    chunksDone={chunksDone}
                    chunksTotal={chunksTotal}
                    totalItems={totalItems}
                    elapsed={elapsed}
                    eta={eta}
                    funIdx={funIdx}
                    funMessages={FUN_MESSAGES}
                  />
                )}

                {stage === "idle" && (
                  <div className="animate-fade-in-up">
                    {!envHasApiKey && (
                      <div
                        className="apple-card flex items-center gap-3 p-4 mb-4"
                        style={{
                          borderColor: "var(--warning)",
                          background: "var(--warning-soft)",
                        }}
                      >
                        <svg
                          width="18" height="18" viewBox="0 0 24 24" fill="none"
                          stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          className="flex-shrink-0"
                        >
                          <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                          尚未配置 LLM API Key，请点击右上角「配置 LLM」进行设置。
                        </p>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleStart}
                        className="btn-apple w-full py-3.5 text-[15px] font-medium flex items-center justify-center gap-2"
                      >
                        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 3l5 5-5 5" />
                        </svg>
                        开始转换
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 单文件完成 */}
            {stage === "done" && (
              <SingleDone
                dataset={dataset}
                exportFormat={exportFormat}
                onDatasetChange={setDataset}
                setExportFormat={setExportFormat}
                downloadName={downloadName}
                setDownloadName={setDownloadName}
                defaultDownloadName={defaultDownloadName()}
                handleDownload={handleDownload}
                handleReset={() => {
                  setFile(null);
                  setSourceName("");
                  setStage("idle");
                  setDataset([]);
                }}
              />
            )}
          </>
        )}

        {/* ============================================================ */}
        {/*                  批量模式                                     */}
        {/* ============================================================ */}
        {isBatchView && (
          <>
            {/* 批量上传区（未选择文件时） */}
            {batchFiles.length === 0 && batchStage !== "done" && (
              <FileUploadPanel
                onFileSelect={(f) => handleBatchFilesSelect([f])}
                onFilesSelect={handleBatchFilesSelect}
                batchMode={true}
              />
            )}

            {/* 批量文件列表（已选择但未开始处理） */}
            {batchFiles.length > 0 && batchStage === "idle" && (
              <div className="animate-fade-in-up space-y-4">
                <BatchFileList
                  files={batchFiles}
                  onRemove={handleRemoveBatchFile}
                  onClear={handleClearBatchFiles}
                />

                {!envHasApiKey && (
                  <div
                    className="apple-card flex items-center gap-3 p-4"
                    style={{
                      borderColor: "var(--warning)",
                      background: "var(--warning-soft)",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                      <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                      尚未配置 LLM API Key，请点击右上角「配置 LLM」进行设置。
                    </p>
                  </div>
                )}

                <button
                  onClick={handleStartBatch}
                  className="btn-apple w-full py-3.5 text-[15px] font-medium flex items-center justify-center gap-2"
                >
                  <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 3l5 5-5 5" />
                  </svg>
                  开始批量转换（{batchFiles.length} 个文件）
                </button>
              </div>
            )}

            {/* 批量处理中 */}
            {batchStage === "processing" && (
              <div className="animate-fade-in-up space-y-4">
                <div className="apple-card p-6">
                  {/* 总体进度 */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-5 h-5 rounded-full border-2 animate-spin-slow flex-shrink-0"
                        style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
                      />
                      <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>
                        批量处理中（{batchFiles.filter((f) => f.status === "done" || f.status === "error").length}/{batchFiles.length}）
                      </span>
                    </div>
                    <button
                      onClick={handleAbortBatch}
                      className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-300"
                      style={{ background: "var(--error-soft)", color: "var(--error)" }}
                    >
                      中断
                    </button>
                  </div>

                  {/* 批量文件进度列表 */}
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {batchFiles.map((bf, idx) => (
                      <BatchFileProgressItem key={idx} info={bf} index={idx} isActive={idx === processingIdx} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 批量完成 */}
            {batchStage === "done" && batchResult && (
              <BatchDone
                result={batchResult}
                exportFormat={exportFormat}
                setExportFormat={setExportFormat}
                onDownloadCombined={handleDownloadBatchCombined}
                onDownloadSeparate={handleDownloadBatchSeparate}
                onReset={handleClearBatchFiles}
                batchFiles={batchFiles}
              />
            )}
          </>
        )}

        {/* ---- 特性区（仅在无内容时显示） ---- */}
        {!file && stage === "idle" && batchFiles.length === 0 && batchStage !== "done" && (
          <div className="feature-grid animate-fade-in-up delay-500 mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                title: "智能拆解",
                desc: "AI 自动识别文档结构，精准提取知识点",
                icon: (
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
                ),
                color: "var(--accent)",
              },
              {
                title: "高质量问答",
                desc: "生成 Alpaca / ShareGPT 双格式指令-输出对",
                icon: (
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
                ),
                color: "var(--success)",
              },
              {
                title: "批量导入",
                desc: "支持多文件批量处理，合并导出数据集",
                icon: (
                  <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" strokeLinecap="round" strokeLinejoin="round" />
                ),
                color: "var(--warning)",
              },
            ].map((feat, i) => (
              <div key={i} className="feature-card apple-card apple-card-hover p-5 h-full">
                <div
                  className="w-10 h-10 rounded-[11px] flex items-center justify-center mb-3"
                  style={{ background: `${feat.color}15`, color: feat.color }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    {feat.icon}
                  </svg>
                </div>
                <h4 className="text-headline text-[15px] mb-1" style={{ color: "var(--text-primary)" }}>
                  {feat.title}
                </h4>
                <p className="text-body text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {feat.desc}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>

      <LLMConfigPanel
        isOpen={configOpen}
        onClose={() => setConfigOpen(false)}
        apiKey={llmConfig.apiKey}
        baseUrl={llmConfig.baseUrl}
        model={llmConfig.model}
        onSave={(config) => {
          setLlmConfig(config);
          setEnvHasApiKey(true);
        }}
      />

      <HistoryPanel
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onLoad={handleLoadHistory}
      />
    </div>
  );
}

// ================================================================
//  子组件
// ================================================================

/** 单文件处理进度 */
function SingleProgress({
  progress,
  stepLabel,
  chunksDone,
  chunksTotal,
  totalItems,
  elapsed,
  eta,
  funIdx,
  funMessages,
}: {
  progress: number;
  stepLabel: string;
  chunksDone: number;
  chunksTotal: number;
  totalItems: number;
  elapsed: number;
  eta: number | null;
  funIdx: number;
  funMessages: string[];
}) {
  return (
    <div className="animate-fade-in-up">
      <div className="apple-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-5 h-5 rounded-full border-2 animate-spin-slow flex-shrink-0"
              style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
            />
            <span className="text-[14px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {stepLabel || "正在转换文档…"}
            </span>
          </div>
          <span className="text-[14px] font-mono font-semibold flex-shrink-0 ml-3" style={{ color: "var(--accent)" }}>
            {progress}%
          </span>
        </div>

        <div className="progress-track h-2">
          <div className="progress-fill h-full" style={{ width: `${progress}%` }} />
        </div>

        {(chunksTotal > 0 || elapsed > 0) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <ProgressStat label="分块" value={chunksTotal > 0 ? `${chunksDone} / ${chunksTotal}` : "—"} />
            <ProgressStat label="已生成" value={totalItems > 0 ? `${totalItems} 条` : "—"} />
            <ProgressStat label="用时" value={formatElapsed(elapsed)} />
            <ProgressStat label="预计剩余" value={eta !== null ? formatElapsed(eta) : "—"} />
          </div>
        )}

        <div
          className="flex items-center gap-2 mt-4 px-3.5 py-2.5 rounded-[10px]"
          style={{ background: "var(--bg-surface-secondary)" }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="1.5" className="flex-shrink-0">
            <path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5L8 1z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {funMessages[funIdx]}
          </p>
        </div>
      </div>
    </div>
  );
}

/** 单文件完成视图 */
function SingleDone({
  dataset,
  onDatasetChange,
  exportFormat,
  setExportFormat,
  downloadName,
  setDownloadName,
  defaultDownloadName,
  handleDownload,
  handleReset,
}: {
  dataset: AlpacaItem[];
  onDatasetChange: (items: AlpacaItem[]) => void;
  exportFormat: ExportFormat;
  setExportFormat: (f: ExportFormat) => void;
  downloadName: string;
  setDownloadName: (n: string) => void;
  defaultDownloadName: string;
  handleDownload: () => void;
  handleReset: () => void;
}) {
  const managed = dataset.some((item) => "reviewStatus" in item);
  const acceptedCount = managed
    ? dataset.filter((item) => "reviewStatus" in item && item.reviewStatus === "accepted").length
    : dataset.length;
  return (
    <div className="animate-scale-in space-y-5">
      <div className="apple-card p-6 text-center max-w-2xl mx-auto">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "var(--success-soft)" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h3 className="text-headline text-[19px] mb-1" style={{ color: "var(--text-primary)" }}>
          转换完成
        </h3>
        <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
          成功生成 {dataset.length} 条 {exportFormat === "sharegpt" ? "ShareGPT" : "Alpaca"} 格式数据
        </p>

        <div className="mt-4 flex justify-center">
          <div className="inline-flex p-1 rounded-full" style={{ background: "var(--bg-surface-secondary)" }}>
            {(["alpaca", "sharegpt"] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setExportFormat(fmt)}
                className="px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-300 ease-apple"
                style={
                  exportFormat === fmt
                    ? { background: "var(--accent)", color: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }
                    : { background: "transparent", color: "var(--text-secondary)" }
                }
              >
                {fmt === "alpaca" ? "Alpaca" : "ShareGPT"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-2.5">
          <div className="relative flex-1 sm:max-w-[280px]">
            <input
              type="text"
              value={downloadName || defaultDownloadName}
              onChange={(e) => setDownloadName(e.target.value)}
              placeholder={defaultDownloadName}
              className="w-full px-4 py-3 pr-12 rounded-[10px] text-[14px] font-mono outline-none transition-all duration-300 ease-apple"
              style={{ background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
              onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; e.target.style.boxShadow = "0 0 0 3px var(--accent-soft)"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--border-default)"; e.target.style.boxShadow = "none"; }}
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-mono" style={{ color: "var(--text-tertiary)" }}>
              .json
            </span>
          </div>
          <button
            onClick={handleDownload}
            disabled={acceptedCount === 0}
            className="btn-apple px-8 py-3 text-[15px] font-medium inline-flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v10M4 9l4 4 4-4M3 15h10" />
            </svg>
            {managed ? `下载已接受数据（${acceptedCount}）` : `下载数据集（${acceptedCount}）`}
          </button>
        </div>
      </div>

      <DatasetWorkbench data={dataset} onChange={onDatasetChange} />

      <div className="text-center">
        <button
          onClick={handleReset}
          className="btn-ghost px-6 py-2.5 text-[14px] font-medium inline-flex items-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 3l-5 5 5 5" />
          </svg>
          转换新文档
        </button>
      </div>
    </div>
  );
}

/** 批量文件列表（处理前预览） */
function BatchFileList({
  files,
  onRemove,
  onClear,
}: {
  files: BatchFileInfo[];
  onRemove: (idx: number) => void;
  onClear: () => void;
}) {
  const totalSize = files.reduce((acc, f) => acc + f.file.size, 0);
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  };

  return (
    <div className="apple-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3" style={{ background: "var(--bg-surface-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="14" height="10" rx="1.5" />
            <path d="M4 4V2.5a1 1 0 011-1h6a1 1 0 011 1V4" />
          </svg>
          <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>
            已选择 {files.length} 个文件
          </span>
          <span className="text-[12px] font-mono" style={{ color: "var(--text-tertiary)" }}>
            （共 {formatSize(totalSize)}）
          </span>
        </div>
        <button
          onClick={onClear}
          className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-300"
          style={{ background: "var(--bg-surface-tertiary)", color: "var(--text-tertiary)" }}
        >
          清空
        </button>
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        {files.map((bf, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-5 py-3 transition-colors duration-300"
            style={{ borderBottom: i < files.length - 1 ? "1px solid var(--border-subtle)" : "none" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-surface-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <div
              className="w-9 h-9 rounded-[9px] flex items-center justify-center flex-shrink-0"
              style={{ background: getFileTypeColor(bf.file.name) + "18" }}
            >
              <span className="text-[9px] font-mono font-bold uppercase" style={{ color: getFileTypeColor(bf.file.name) }}>
                {bf.file.name.split(".").pop() || "?"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                {bf.file.name}
              </p>
              <p className="text-[11px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                {formatFileSize(bf.file.size)}
              </p>
            </div>
            <button
              onClick={() => onRemove(i)}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 flex-shrink-0"
              style={{ background: "var(--bg-surface-tertiary)", color: "var(--text-tertiary)" }}
              aria-label="移除"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 批量处理中的单个文件进度条 */
function BatchFileProgressItem({ info, index, isActive }: { info: BatchFileInfo; index: number; isActive: boolean }) {
  const statusColors: Record<string, string> = {
    pending: "var(--text-tertiary)",
    uploading: "var(--accent)",
    processing: "var(--accent)",
    done: "var(--success)",
    error: "var(--error)",
  };
  const statusIcons: Record<string, string> = {
    pending: "○",
    uploading: "●",
    processing: "●",
    done: "✓",
    error: "✕",
  };

  return (
    <div
      className="rounded-[10px] px-4 py-2.5 transition-all duration-300"
      style={{
        background: isActive ? "var(--accent-soft)" : "var(--bg-surface-secondary)",
        opacity: info.status === "done" ? 0.8 : info.status === "error" ? 0.9 : 1,
      }}
    >
      <div className="flex items-center gap-2.5 mb-1.5">
        {/* 状态图标 */}
        <span className="text-[12px] font-mono font-bold" style={{ color: statusColors[info.status] || "var(--text-tertiary)" }}>
          {statusIcons[info.status] || "○"}
        </span>
        {/* 序号 */}
        <span className="text-[11px] font-mono" style={{ color: "var(--text-tertiary)" }}>
          #{index + 1}
        </span>
        {/* 文件名 */}
        <span className="text-[12px] font-medium truncate flex-1" style={{ color: "var(--text-primary)" }}>
          {info.file.name}
        </span>
        {/* 进度百分比 */}
        {info.status !== "pending" && (
          <span className="text-[11px] font-mono font-semibold" style={{ color: statusColors[info.status] || "var(--text-tertiary)" }}>
            {info.progress}%
          </span>
        )}
      </div>

      {/* 进度条 */}
      {(info.status === "uploading" || info.status === "processing") && (
        <div className="progress-track h-1.5 ml-5">
          <div
            className="progress-fill h-full"
            style={{ width: `${info.progress}%` }}
          />
        </div>
      )}

      {/* 步骤说明 / 错误信息 */}
      <p className="text-[11px] ml-5 mt-0.5 truncate" style={{ color: info.error ? "var(--error)" : "var(--text-tertiary)" }}>
        {info.error || info.stepLabel || (info.status === "pending" ? "等待处理…" : "")}
      </p>
    </div>
  );
}

/** 批量完成视图 */
function BatchDone({
  result,
  exportFormat,
  setExportFormat,
  onDownloadCombined,
  onDownloadSeparate,
  onReset,
  batchFiles,
}: {
  result: BatchResult;
  exportFormat: ExportFormat;
  setExportFormat: (f: ExportFormat) => void;
  onDownloadCombined: () => void;
  onDownloadSeparate: () => void;
  onReset: () => void;
  batchFiles: BatchFileInfo[];
}) {
  const allSuccessItems = result.files
    .filter((f) => f.status === "done")
    .flatMap((f) => f.items);

  const [, setReviewVersion] = useState(0);
  const acceptedCount = allSuccessItems.filter(
    (item) => "reviewStatus" in item && item.reviewStatus === "accepted"
  ).length;
  const acceptedFileCount = result.files.filter((file) => file.status === "done" && file.items.some(
    (item) => !("reviewStatus" in item) || item.reviewStatus === "accepted"
  )).length;
  const handleBatchReviewChange = (items: AlpacaItem[]) => {
    for (const updated of items) {
      if (!("id" in updated)) continue;
      const original = allSuccessItems.find((item) => "id" in item && item.id === updated.id);
      if (original) Object.assign(original, updated);
    }
    setReviewVersion((version) => version + 1);
  };

  return (
    <div className="animate-scale-in space-y-5">
      {/* 汇总卡片 */}
      <div className="apple-card p-6 text-center max-w-2xl mx-auto">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "var(--success-soft)" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h3 className="text-headline text-[19px] mb-1" style={{ color: "var(--text-primary)" }}>
          批量转换完成
        </h3>
        <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
          处理 {result.totalFiles} 个文件 · 成功 {result.successFiles} 个 · 失败 {result.failedFiles} 个
        </p>
        <p className="text-[13px] font-mono mt-1" style={{ color: "var(--accent)" }}>
          共生成 {result.totalItems} 条数据
        </p>
      </div>

      {/* 导出设置 */}
      <div className="apple-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v10M4 9l4 4 4-4M3 15h10" />
          </svg>
          <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>
            导出设置
          </span>
        </div>

        {/* 格式切换 */}
        <div className="flex justify-center mb-4">
          <div className="inline-flex p-1 rounded-full" style={{ background: "var(--bg-surface-secondary)" }}>
            {(["alpaca", "sharegpt"] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setExportFormat(fmt)}
                className="px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-300 ease-apple"
                style={
                  exportFormat === fmt
                    ? { background: "var(--accent)", color: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }
                    : { background: "transparent", color: "var(--text-secondary)" }
                }
              >
                {fmt === "alpaca" ? "Alpaca" : "ShareGPT"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={onDownloadCombined}
            className="btn-apple py-3 text-[14px] font-medium inline-flex items-center justify-center gap-2"
            disabled={acceptedCount === 0}
            style={acceptedCount === 0 ? { opacity: 0.5, cursor: "not-allowed" } : {}}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v10M4 9l4 4 4-4M3 15h10" />
            </svg>
            合并下载已接受数据（{acceptedCount} 条）
          </button>
          <button
            onClick={onDownloadSeparate}
            className="btn-apple py-3 text-[14px] font-medium inline-flex items-center justify-center gap-2"
            disabled={acceptedCount === 0}
            style={acceptedCount === 0 ? { opacity: 0.5, cursor: "not-allowed" } : {}}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l-5 5 5 5" />
              <path d="M4 3v10" />
            </svg>
            分别下载（{acceptedFileCount} 个文件 / {acceptedCount} 条）
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="apple-card p-4 text-center">
          <p className="text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>文件总数</p>
          <p className="text-[24px] font-mono font-bold mt-1" style={{ color: "var(--text-primary)" }}>{result.totalFiles}</p>
        </div>
        <div className="apple-card p-4 text-center">
          <p className="text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>成功</p>
          <p className="text-[24px] font-mono font-bold mt-1" style={{ color: "var(--success)" }}>{result.successFiles}</p>
        </div>
        <div className="apple-card p-4 text-center">
          <p className="text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>数据总条数</p>
          <p className="text-[24px] font-mono font-bold mt-1" style={{ color: "var(--accent)" }}>{result.totalItems}</p>
        </div>
      </div>

      {/* 合并数据集预览 */}
      {allSuccessItems.length > 0 && (
        <>
          <DatasetWorkbench data={allSuccessItems} onChange={handleBatchReviewChange} />
        </>
      )}

      {/* 各文件明细 */}
      <BatchFilesBreakdown files={batchFiles} result={result} />

      {/* 返回 */}
      <div className="text-center">
        <button
          onClick={onReset}
          className="btn-ghost px-6 py-2.5 text-[14px] font-medium inline-flex items-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 3l-5 5 5 5" />
          </svg>
          重新选择文件
        </button>
      </div>
    </div>
  );
}

/** 各文件处理结果明细 */
function BatchFilesBreakdown({ files, result }: { files: BatchFileInfo[]; result: BatchResult }) {
  return (
    <div className="apple-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3" style={{ background: "var(--bg-surface-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="14" height="10" rx="1.5" />
          <path d="M4 4V2.5a1 1 0 011-1h6a1 1 0 011 1V4" />
        </svg>
        <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
          各文件处理明细
        </span>
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        {files.map((bf, i) => {
          const res = result.files[i];
          return (
            <div
              key={i}
              className="flex items-center gap-3 px-5 py-3"
              style={{ borderBottom: i < files.length - 1 ? "1px solid var(--border-subtle)" : "none" }}
            >
              <div
                className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0"
                style={{ background: getFileTypeColor(bf.file.name) + "18" }}
              >
                <span className="text-[8px] font-mono font-bold uppercase" style={{ color: getFileTypeColor(bf.file.name) }}>
                  {bf.file.name.split(".").pop() || "?"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                  {bf.file.name}
                </p>
              </div>
              {bf.status === "done" && (
                <span className="text-[12px] font-mono font-semibold" style={{ color: "var(--success)" }}>
                  {res?.itemCount || bf.totalItems} 条
                </span>
              )}
              {bf.status === "error" && (
                <span className="text-[11px]" style={{ color: "var(--error)" }}>
                  {bf.error || "失败"}
                </span>
              )}
              {bf.status === "done" && (
                <span className="text-[11px]" style={{ color: "var(--success)" }}>
                  ✓
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 进度统计小卡片 */
function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] px-3 py-2" style={{ background: "var(--bg-surface-secondary)" }}>
      <p className="text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </p>
      <p className="text-[14px] font-mono font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

/** 格式化已用时间 / 剩余时间 */
function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

/** 根据文件名获取类型颜色 */
function getFileTypeColor(name: string): string {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  const colors: Record<string, string> = {
    ".pdf": "var(--error)",
    ".docx": "var(--accent)",
    ".pptx": "var(--warning)",
    ".ppt": "var(--warning)",
    ".txt": "var(--text-secondary)",
    ".md": "var(--success)",
    ".html": "var(--warning)",
    ".htm": "var(--warning)",
  };
  return colors[ext] || "var(--text-secondary)";
}
