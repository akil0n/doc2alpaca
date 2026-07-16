"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { AlpacaItem } from "@/types";
import {
  createQARecord,
  reEvaluateRecord,
  type QARecord,
  type ReviewStatus,
} from "@/lib/qaPipeline";
import { QuestionSearchIndex, type QuestionSearchResult, type SearchMode } from "@/lib/questionSearch";

interface DatasetWorkbenchProps {
  data: AlpacaItem[];
  onChange?: (items: AlpacaItem[]) => void;
}

type StatusFilter = "all" | ReviewStatus;
type QualityFilter = "all" | "attention" | "strong";

const PAGE_SIZE = 50;

const STATUS_META: Record<ReviewStatus, { label: string; color: string; soft: string }> = {
  pending: { label: "待审核", color: "var(--warning)", soft: "var(--warning-soft)" },
  accepted: { label: "已接受", color: "var(--success)", soft: "var(--success-soft)" },
  rejected: { label: "已拒绝", color: "var(--error)", soft: "var(--error-soft)" },
  needs_revision: { label: "待修改", color: "var(--accent)", soft: "var(--accent-soft)" },
};

export function DatasetWorkbench({ data, onChange }: DatasetWorkbenchProps) {
  const [records, setRecords] = useState<QARecord[]>(() => normalizeRecords(data));
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [searchMode, setSearchMode] = useState<SearchMode>("hybrid");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");
  const [fileFilter, setFileFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<QuestionSearchResult[]>([]);
  const searchWorker = useRef<Worker | null>(null);
  const searchRequestId = useRef(0);

  useEffect(() => {
    const normalized = normalizeRecords(data);
    setRecords(normalized);
    setSelectedId((current) => current && normalized.some((item) => item.id === current) ? current : normalized[0]?.id || null);
  }, [data]);

  const searchQuery = useMemo(() => ({
    query: deferredQuery,
    mode: searchMode,
    reviewStatuses: statusFilter === "all" ? undefined : [statusFilter],
    fileNames: fileFilter === "all" ? undefined : [fileFilter],
    minQuality: qualityFilter === "strong" ? 0.8 : undefined,
    maxQuality: qualityFilter === "attention" ? 0.649 : undefined,
    limit: Math.max(records.length, 1),
  }), [deferredQuery, fileFilter, qualityFilter, records.length, searchMode, statusFilter]);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      setResults(new QuestionSearchIndex(records).search(searchQuery));
      return;
    }
    const worker = new Worker(new URL("../workers/questionSearch.worker.ts", import.meta.url));
    searchWorker.current = worker;
    worker.onmessage = (event: MessageEvent<{ requestId: number; results: QuestionSearchResult[] }>) => {
      if (event.data.requestId === searchRequestId.current) setResults(event.data.results);
    };
    worker.onerror = () => {
      worker.terminate();
      if (searchWorker.current === worker) searchWorker.current = null;
      setResults(new QuestionSearchIndex(records).search(searchQuery));
    };
    worker.postMessage({ type: "init", records });
    const requestId = ++searchRequestId.current;
    worker.postMessage({ type: "search", requestId, query: searchQuery });
    return () => {
      worker.terminate();
      if (searchWorker.current === worker) searchWorker.current = null;
    };
    // The worker is rebuilt only when indexed records change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  useEffect(() => {
    const worker = searchWorker.current;
    if (!worker) {
      setResults(new QuestionSearchIndex(records).search(searchQuery));
      return;
    }
    const requestId = ++searchRequestId.current;
    worker.postMessage({ type: "search", requestId, query: searchQuery });
  }, [records, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const visibleResults = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = records.find((record) => record.id === selectedId) || null;

  useEffect(() => setPage(1), [deferredQuery, fileFilter, qualityFilter, searchMode, statusFilter]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const stats = useMemo(() => summarize(records), [records]);
  const files = useMemo(() => [...new Set(records.map((item) => item.source.fileName))], [records]);

  const commit = (next: QARecord[]) => {
    setRecords(next);
    if (onChange) {
      onChange(next);
    } else {
      // 批量结果仍由父级持有；保持对象身份可让导出立即反映审核修改。
      for (const record of next) {
        const original = data.find((item) => isQARecord(item) && item.id === record.id);
        if (original) Object.assign(original, record);
      }
    }
  };

  const updateRecord = (updated: QARecord) => {
    startTransition(() => commit(records.map((record) => record.id === updated.id ? updated : record)));
  };

  const bulkSetStatus = (status: ReviewStatus) => {
    if (!checkedIds.size) return;
    startTransition(() => {
      commit(records.map((record) => checkedIds.has(record.id) ? { ...record, reviewStatus: status } : record));
      setCheckedIds(new Set());
    });
  };

  if (!records.length) return null;

  return (
    <section className="review-workbench motion-surface" aria-label="问答数据审核工作台">
      <WorkbenchHeader
        stats={stats}
        query={query}
        onQueryChange={setQuery}
        searchMode={searchMode}
        onSearchModeChange={setSearchMode}
        resultCount={results.length}
        isSearching={isPending || query !== deferredQuery}
      />

      <div className="review-layout">
        <FilterRail
          stats={stats}
          files={files}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          qualityFilter={qualityFilter}
          setQualityFilter={setQualityFilter}
          fileFilter={fileFilter}
          setFileFilter={setFileFilter}
        />

        <div className="review-list-pane">
          <BulkToolbar
            checked={checkedIds.size}
            totalVisible={visibleResults.length}
            onToggleAll={() => {
              const visibleIds = visibleResults.map((result) => result.record.id);
              const allChecked = visibleIds.every((id) => checkedIds.has(id));
              setCheckedIds(allChecked ? new Set() : new Set(visibleIds));
            }}
            onAccept={() => bulkSetStatus("accepted")}
            onReject={() => bulkSetStatus("rejected")}
            onNeedsRevision={() => bulkSetStatus("needs_revision")}
          />

          <div className="review-results" aria-live="polite" aria-busy={isPending}>
            {visibleResults.length ? visibleResults.map((result, indexInPage) => (
              <QuestionRow
                key={result.record.id}
                record={result.record}
                score={result.score}
                index={(page - 1) * PAGE_SIZE + indexInPage + 1}
                selected={result.record.id === selectedId}
                checked={checkedIds.has(result.record.id)}
                onCheck={(checked) => {
                  const next = new Set(checkedIds);
                  checked ? next.add(result.record.id) : next.delete(result.record.id);
                  setCheckedIds(next);
                }}
                onSelect={() => setSelectedId(result.record.id)}
              />
            )) : (
              <EmptyResults onReset={() => {
                setQuery("");
                setStatusFilter("all");
                setQualityFilter("all");
                setFileFilter("all");
              }} />
            )}
          </div>

          {totalPages > 1 && (
            <div className="review-pagination">
              <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, results.length)} / {results.length}</span>
              <div>
                <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>上一页</button>
                <span>{page} / {totalPages}</span>
                <button onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages}>下一页</button>
              </div>
            </div>
          )}
        </div>

        <Inspector
          key={selected?.id || "empty"}
          record={selected}
          onSave={updateRecord}
          onRestoreDuplicate={(candidate) => {
            if (!selected) return;
            const remaining = selected.duplicateCandidates?.filter((item) => item.record.id !== candidate.id);
            commit([
              ...records.map((item) => item.id === selected.id ? { ...item, duplicateCandidates: remaining } : item),
              { ...candidate, reviewStatus: "pending" },
            ]);
          }}
        />
      </div>
    </section>
  );
}

function WorkbenchHeader({
  stats,
  query,
  onQueryChange,
  searchMode,
  onSearchModeChange,
  resultCount,
  isSearching,
}: {
  stats: ReturnType<typeof summarize>;
  query: string;
  onQueryChange: (value: string) => void;
  searchMode: SearchMode;
  onSearchModeChange: (value: SearchMode) => void;
  resultCount: number;
  isSearching: boolean;
}) {
  return (
    <header className="workbench-header">
      <div className="workbench-title">
        <div className="workbench-mark" aria-hidden="true"><span /></div>
        <div>
          <p>DATASET REVIEW</p>
          <h2>问答审核工作台</h2>
        </div>
      </div>
      <div className="workbench-search-wrap">
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="检索问题、答案、章节或文件…"
          aria-label="检索问答"
        />
        {isSearching && <span className="search-pulse" aria-label="检索中" />}
        <span className="search-count">{resultCount}</span>
      </div>
      <div className="search-mode-switch" aria-label="检索模式">
        {(["keyword", "hybrid", "fuzzy"] as SearchMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => onSearchModeChange(mode)}
            data-active={searchMode === mode}
          >
            {mode === "keyword" ? "精确" : mode === "hybrid" ? "混合" : "模糊"}
          </button>
        ))}
      </div>
      <div className="quality-orbit" style={{ "--quality": `${stats.averageQuality * 360}deg` } as React.CSSProperties}>
        <strong>{Math.round(stats.averageQuality * 100)}</strong><span>质量</span>
      </div>
    </header>
  );
}

function FilterRail({
  stats,
  files,
  statusFilter,
  setStatusFilter,
  qualityFilter,
  setQualityFilter,
  fileFilter,
  setFileFilter,
}: {
  stats: ReturnType<typeof summarize>;
  files: string[];
  statusFilter: StatusFilter;
  setStatusFilter: (value: StatusFilter) => void;
  qualityFilter: QualityFilter;
  setQualityFilter: (value: QualityFilter) => void;
  fileFilter: string;
  setFileFilter: (value: string) => void;
}) {
  const statuses: Array<{ value: StatusFilter; label: string; count: number }> = [
    { value: "all", label: "全部数据", count: stats.total },
    { value: "pending", label: "待审核", count: stats.pending },
    { value: "accepted", label: "已接受", count: stats.accepted },
    { value: "needs_revision", label: "待修改", count: stats.needsRevision },
    { value: "rejected", label: "已拒绝", count: stats.rejected },
  ];

  return (
    <aside className="filter-rail" aria-label="数据筛选">
      <FilterGroup title="审核状态">
        {statuses.map((item) => (
          <button key={item.value} data-active={statusFilter === item.value} onClick={() => setStatusFilter(item.value)}>
            <span>{item.label}</span><b>{item.count}</b>
          </button>
        ))}
      </FilterGroup>
      <FilterGroup title="质量区间">
        <button data-active={qualityFilter === "all"} onClick={() => setQualityFilter("all")}><span>全部质量</span></button>
        <button data-active={qualityFilter === "attention"} onClick={() => setQualityFilter("attention")}><span>需要关注</span><b>{stats.attention}</b></button>
        <button data-active={qualityFilter === "strong"} onClick={() => setQualityFilter("strong")}><span>高质量</span><b>{stats.strong}</b></button>
      </FilterGroup>
      <FilterGroup title="来源文件">
        <button data-active={fileFilter === "all"} onClick={() => setFileFilter("all")}><span>全部文件</span><b>{files.length}</b></button>
        {files.map((file) => (
          <button key={file} data-active={fileFilter === file} onClick={() => setFileFilter(file)} title={file}>
            <span className="truncate">{file}</span>
          </button>
        ))}
      </FilterGroup>
      <div className="coverage-card">
        <span>审核覆盖</span>
        <strong>{stats.total ? Math.round(((stats.accepted + stats.rejected + stats.needsRevision) / stats.total) * 100) : 0}%</strong>
        <div><i style={{ "--coverage": stats.total ? (stats.accepted + stats.rejected + stats.needsRevision) / stats.total : 0 } as React.CSSProperties} /></div>
      </div>
    </aside>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="filter-group"><h3>{title}</h3>{children}</div>;
}

function BulkToolbar({
  checked,
  totalVisible,
  onToggleAll,
  onAccept,
  onReject,
  onNeedsRevision,
}: {
  checked: number;
  totalVisible: number;
  onToggleAll: () => void;
  onAccept: () => void;
  onReject: () => void;
  onNeedsRevision: () => void;
}) {
  return (
    <div className="bulk-toolbar" data-active={checked > 0}>
      <button className="select-all" onClick={onToggleAll}>{checked === totalVisible && totalVisible > 0 ? "取消全选" : "选择本页"}</button>
      <span>{checked ? `已选择 ${checked} 条` : "选择数据后可批量审核"}</span>
      <div>
        <button onClick={onAccept} disabled={!checked}>接受</button>
        <button onClick={onNeedsRevision} disabled={!checked}>待修改</button>
        <button onClick={onReject} disabled={!checked}>拒绝</button>
      </div>
    </div>
  );
}

function QuestionRow({
  record,
  score,
  index,
  selected,
  checked,
  onCheck,
  onSelect,
}: {
  record: QARecord;
  score: number;
  index: number;
  selected: boolean;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  onSelect: () => void;
}) {
  const status = STATUS_META[record.reviewStatus];
  return (
    <article className="question-row" data-selected={selected} onClick={onSelect}>
      <label className="row-checkbox" onClick={(event) => event.stopPropagation()}>
        <input type="checkbox" checked={checked} onChange={(event) => onCheck(event.target.checked)} aria-label={`选择第 ${index} 条`} />
        <span />
      </label>
      <span className="row-index">{String(index).padStart(3, "0")}</span>
      <div className="row-copy">
        <h3>{record.instruction}</h3>
        <p>{record.output}</p>
        <div>
          <span className="source-chip">{record.source.heading || record.source.fileName}</span>
          <span>{taskLabel(record.taskType)}</span>
          {score > 0 && score < 1 && <span>匹配 {Math.round(score * 100)}%</span>}
        </div>
      </div>
      <div className="row-metrics">
        <QualityBadge value={record.quality.overall} />
        <span style={{ color: status.color, background: status.soft }}>{status.label}</span>
      </div>
    </article>
  );
}

function Inspector({
  record,
  onSave,
  onRestoreDuplicate,
}: {
  record: QARecord | null;
  onSave: (record: QARecord) => void;
  onRestoreDuplicate: (record: Omit<QARecord, "duplicateCandidates">) => void;
}) {
  const [instruction, setInstruction] = useState(record?.instruction || "");
  const [input, setInput] = useState(record?.input || "");
  const [output, setOutput] = useState(record?.output || "");

  useEffect(() => {
    setInstruction(record?.instruction || "");
    setInput(record?.input || "");
    setOutput(record?.output || "");
  }, [record]);

  if (!record) return <aside className="inspector-pane inspector-empty"><span>选择一条问答查看详情</span></aside>;
  const dirty = instruction !== record.instruction || input !== record.input || output !== record.output;

  return (
    <aside className="inspector-pane motion-inspector" aria-label="问答详情与编辑">
      <div className="inspector-head">
        <div><p>RECORD</p><strong>{record.id}</strong></div>
        <QualityBadge value={record.quality.overall} large />
      </div>

      <div className="status-actions">
        {(["accepted", "needs_revision", "rejected"] as ReviewStatus[]).map((status) => (
          <button key={status} disabled={!instruction.trim() || !output.trim()} data-active={record.reviewStatus === status} onClick={() => onSave(reEvaluateRecord({ ...record, instruction: instruction.trim(), input: input.trim(), output: output.trim(), reviewStatus: status }))}>
            {STATUS_META[status].label}
          </button>
        ))}
      </div>

      <EditorField label="问题 / Instruction" value={instruction} onChange={setInstruction} rows={3} />
      <EditorField label="输入 / Input" value={input} onChange={setInput} rows={3} optional />
      <EditorField label="答案 / Output" value={output} onChange={setOutput} rows={7} />

      <button
        className="save-record"
        disabled={!dirty || !instruction.trim() || !output.trim()}
        onClick={() => onSave(reEvaluateRecord({ ...record, instruction: instruction.trim(), input: input.trim(), output: output.trim() }))}
      >
        保存并重新评估
      </button>

      <div className="quality-panel">
        <h3>启发式预筛</h3>
        <QualityLine label="证据词面覆盖" value={record.quality.groundedness} unavailable={record.quality.evidenceAvailable === false} />
        <QualityLine label="长度完整性" value={record.quality.completeness} />
        <QualityLine label="问题清晰" value={record.quality.clarity} />
        <QualityLine label="问答相关" value={record.quality.relevance} />
        {record.quality.flags.length > 0 && (
          <ul>{record.quality.flags.map((flag) => <li key={flag}>{flag}</li>)}</ul>
        )}
      </div>

      {record.duplicateCandidates && record.duplicateCandidates.length > 0 && (
        <div className="quality-panel">
          <h3>疑似重复（已保留供审计）</h3>
          <ul>
            {record.duplicateCandidates.map((candidate) => (
              <li key={candidate.record.id}>
                <strong>{Math.round(candidate.similarity * 100)}% · {candidate.record.instruction}</strong>
                <p>{candidate.record.output}</p>
                <span>{candidate.record.source.fileName} · 质量 {Math.round(candidate.record.quality.overall * 100)}</span>
                <button type="button" onClick={() => onRestoreDuplicate(candidate.record)}>
                  恢复为待审核记录
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="evidence-panel">
        <div><h3>原文证据</h3><span>{record.source.chunkId}</span></div>
        <p>{record.source.fileName} · {record.source.heading || "未识别章节"}</p>
        <pre>{record.source.available === false ? "未保存或未能可靠定位原文证据，忠实度需要人工复核。" : record.source.text}</pre>
      </div>
    </aside>
  );
}

function EditorField({ label, value, onChange, rows, optional }: { label: string; value: string; onChange: (value: string) => void; rows: number; optional?: boolean }) {
  return (
    <label className="editor-field">
      <span>{label}{optional && <i>可选</i>}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} />
    </label>
  );
}

function QualityLine({ label, value, unavailable }: { label: string; value: number; unavailable?: boolean }) {
  return <div className="quality-line"><span>{label}</span><div><i style={{ transform: `scaleX(${unavailable ? 0 : value})` }} /></div><b>{unavailable ? "—" : Math.round(value * 100)}</b></div>;
}

function QualityBadge({ value, large }: { value: number; large?: boolean }) {
  const tone = value >= 0.8 ? "strong" : value >= 0.65 ? "medium" : "attention";
  return <span className="quality-badge" data-tone={tone} data-large={large || undefined}>{Math.round(value * 100)}</span>;
}

function EmptyResults({ onReset }: { onReset: () => void }) {
  return <div className="review-empty"><div className="empty-radar" /><h3>没有匹配的问答</h3><p>调整检索词或筛选条件后再试。</p><button onClick={onReset}>重置筛选</button></div>;
}

function normalizeRecords(data: AlpacaItem[]): QARecord[] {
  return data.map((item, index) => {
    if (isQARecord(item)) return item;
    const evidence = "";
    return createQARecord(item, {
      documentId: "legacy_dataset",
      fileName: "历史数据",
      fileType: "txt",
      chunkId: `legacy_${String(index + 1).padStart(3, "0")}`,
      startOffset: 0,
      endOffset: evidence.length,
      text: evidence,
      available: false,
    }, { createdAt: 0 });
  });
}

function isQARecord(item: AlpacaItem): item is QARecord {
  const candidate = item as Partial<QARecord>;
  return Boolean(candidate.id && candidate.source && candidate.quality && candidate.reviewStatus);
}

function summarize(records: QARecord[]) {
  const count = (status: ReviewStatus) => records.filter((record) => record.reviewStatus === status).length;
  const averageQuality = records.length ? records.reduce((sum, record) => sum + record.quality.overall, 0) / records.length : 0;
  return {
    total: records.length,
    pending: count("pending"),
    accepted: count("accepted"),
    rejected: count("rejected"),
    needsRevision: count("needs_revision"),
    attention: records.filter((record) => record.quality.overall < 0.65).length,
    strong: records.filter((record) => record.quality.overall >= 0.8).length,
    averageQuality,
  };
}

function taskLabel(taskType: QARecord["taskType"]): string {
  const labels: Record<QARecord["taskType"], string> = {
    closed_book_qa: "知识问答",
    reading_comprehension: "阅读理解",
    extraction: "信息抽取",
    analysis: "分析推理",
  };
  return labels[taskType];
}
