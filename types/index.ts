// ============================================================
// doc2alpaca 类型定义
// 所有模块共享的数据结构和接口
// ============================================================

// -------------------- 文件上传 --------------------

/** 支持的文件类型 */
export type FileType = "pdf" | "docx" | "pptx" | "txt" | "md" | "html";

/** 上传文件的元信息 */
export interface FileMeta {
  /** 原始文件名，如 "论文.pdf" */
  fileName: string;
  /** 文件类型 */
  fileType: FileType;
  /** 文件大小（字节） */
  fileSize: number;
  /** 不可猜测的一次性上传令牌；浏览器永远不会获得服务器文件路径 */
  uploadId: string;
}

// -------------------- 文本提取 --------------------

/** 从文档中提取的文本内容 */
export interface ExtractedText {
  /** 提取出的纯文本 */
  text: string;
  /** 总字符数 */
  charCount: number;
  /** 段落数 */
  paragraphCount: number;
  /** 来源文件类型 */
  fileType: FileType;
  /** 源文件名 */
  sourceName: string;
}

// -------------------- LLM 交互 --------------------

/** LLM 调用请求 */
export interface LLMRequest {
  /** 模型名称 */
  model: string;
  /** 对话消息列表 */
  messages: ChatCompletionMessage[];
  /** 温度参数（可选） */
  temperature?: number;
  /** 本次请求最大输出 token 数（可选） */
  maxTokens?: number;
  /** 响应格式约束（可选） */
  response_format?: { type: "json_object" };
}

/** OpenAI 兼容的聊天消息 */
export interface ChatCompletionMessage {
  /** 角色：system / user / assistant */
  role: "system" | "user" | "assistant";
  /** 消息内容 */
  content: string;
}

/** LLM 调用响应 */
export interface LLMResponse {
  /** LLM 返回的原始文本 */
  rawContent: string;
  /** 实际使用的模型 */
  model: string;
  /** Token 用量统计 */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 结束原因：'stop' 自然结束 | 'length' 达到 max_tokens 截断 | null 未知 */
  finishReason: "stop" | "length" | null;
}

// -------------------- Alpaca 数据集 --------------------

/** 单条 Alpaca 数据项 */
export interface AlpacaItem {
  /** 指令：告诉模型要做什么 */
  instruction: string;
  /** 输入：提供给模型的上下文/数据（无输入时为空字符串） */
  input: string;
  /** 输出：期望的正确答案 */
  output: string;
}

/** 解析后的 Alpaca 数据集 */
export interface AlpacaDatasetParsed {
  /** 有效数据条目 */
  items: AlpacaItem[];
  /** LLM 返回的总条目数 */
  totalCount: number;
  /** 通过校验的有效条目数 */
  validCount: number;
  /** 解析过程中的错误信息列表 */
  parseErrors: string[];
}

// -------------------- ShareGPT 格式 --------------------

/** ShareGPT 对话中的单条消息 */
export interface ShareGptMessage {
  /** 消息来源：human 或 gpt */
  from: "human" | "gpt";
  /** 消息内容 */
  value: string;
}

/** ShareGPT 格式的完整对话条目 */
export interface ShareGptItem {
  /** 对话消息列表 */
  conversations: ShareGptMessage[];
}

/** 导出格式枚举 */
export type ExportFormat = "alpaca" | "sharegpt";

// -------------------- 历史记录 --------------------

/** 单条历史记录 */
export interface HistoryRecord {
  /** 记录唯一标识 */
  id: string;
  /** 源文件名 */
  fileName: string;
  /** 文件类型 */
  fileType: string;
  /** 生成时间戳 */
  createdAt: number;
  /** 有效数据条目数 */
  itemCount: number;
  /** 使用的模板 ID */
  templateId: string;
  /** 数据集内容（Alpaca 格式） */
  items: AlpacaItem[];
  /** 是否是批量处理 */
  isBatch: boolean;
  /** 批量处理时的文件列表（可选） */
  batchFiles?: string[];
}

// -------------------- Prompt 模板 --------------------

/** Prompt 模板 */
export interface PromptTemplate {
  /** 模板唯一标识 */
  id: string;
  /** 模板名称，如 "通用文档解析" */
  name: string;
  /** 模板描述 */
  description: string;
  /** System Prompt 内容 */
  systemPrompt: string;
  /** 是否内置模板（内置不可删除） */
  isBuiltin: boolean;
  /** 创建时间戳 */
  createdAt: number;
}

// -------------------- 应用配置 --------------------

/** LLM 供应商标识 */
export type ModelProvider = "openai" | "anthropic" | "ollama" | "custom";

/** 应用运行时配置 */
export interface AppConfig {
  /** LLM 供应商 */
  provider: ModelProvider;
  /** 模型名称 */
  model: string;
  /** API 端点 URL */
  baseUrl: string;
  /** 是否已配置 API Key */
  hasApiKey: boolean;
}

// -------------------- 业务编排 --------------------

/** 流程步骤日志 */
export interface StepLog {
  /** 步骤名称，如 "提取文本"、"调用LLM" */
  stepName: string;
  /** 执行状态 */
  status: "success" | "running" | "failed";
  /** 耗时（毫秒） */
  durationMs: number;
  /** 额外信息（可选） */
  message?: string;
}

/** 文档分析结果 */
export interface AnalysisResult {
  /** 整体是否成功 */
  success: boolean;
  /** 提取的文本内容（可选） */
  extractedText?: ExtractedText;
  /** 解析后的数据集（可选） */
  dataset?: AlpacaDatasetParsed;
  /** 各步骤执行日志 */
  steps: StepLog[];
  /** 错误信息（可选） */
  error?: AnalysisError;
}

/** 分析错误信息 */
export interface AnalysisError {
  /** 错误发生阶段 */
  step: string;
  /** 用户可读的错误描述（中文） */
  message: string;
  /** 原始 Error 信息（调试用） */
  detail?: string;
}

// -------------------- 深度提取引擎 & 会话管理 --------------------

/** 深度提取引擎配置 */
export interface DeepEngineConfig {
  /** 最大轮数（默认 5） */
  maxRounds: number;
  /** 相似度阈值 0-1，新数据与此值以上视为重复终止（默认 0.9） */
  similarityThreshold: number;
  /** 最大输出 tokens（默认 65536） */
  maxTokens: number;
}

/** 会话状态 */
export type SessionStatus = "running" | "completed" | "interrupted" | "aborted";

/** 会话元信息 */
export interface SessionMeta {
  /** 会话 ID */
  sessionId: string;
  /** 会话状态 */
  status: SessionStatus;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后更新时间戳 */
  updatedAt: number;
  /** 源文件信息 */
  sourceFile: {
    uploadId: string;
    fileName: string;
    fileType: FileType;
  };
  /** 匿名浏览器会话所有者的不可逆摘要 */
  ownerHash: string;
  /** 引擎配置 */
  config: DeepEngineConfig;
  /** 统计信息 */
  stats: {
    totalRounds: number;
    totalItems: number;
    lastFinishReason: "stop" | "length" | null;
  };
}

/** 单轮深度提取结果（写入 progress.jsonl 的一行） */
export interface DeepRoundResult {
  /** 轮次编号（从 1 开始） */
  round: number;
  /** 本轮生成的数据条目 */
  items: AlpacaItem[];
  /** 本轮新增有效条数 */
  validCount: number;
  /** 结束原因 */
  finishReason: "stop" | "length" | null;
  /** Token 用量 */
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 时间戳 */
  timestamp: number;
}

/** SSE 事件类型 */
export interface SSERoundEvent {
  type: "round";
  round: number;
  newItems: number;
  totalItems: number;
  finishReason: "stop" | "length" | null;
}

export interface SSEErrorEvent {
  type: "error";
  message: string;
}

export interface SSEDoneEvent {
  type: "done";
  sessionId: string;
  totalRounds: number;
  totalItems: number;
}

export type SSEEvent = SSERoundEvent | SSEErrorEvent | SSEDoneEvent;

// -------------------- 批量导入 --------------------

/** 批量处理中单个文件的状态 */
export type BatchFileStatus = "pending" | "uploading" | "processing" | "done" | "error";

/** 批量处理中的单个文件信息 */
export interface BatchFileInfo {
  /** 原始 File 对象 */
  file: File;
  /** 上传后服务端返回的元信息 */
  meta?: FileMeta;
  /** 处理状态 */
  status: BatchFileStatus;
  /** 处理进度 0-100 */
  progress: number;
  /** 当前步骤描述 */
  stepLabel: string;
  /** 生成的 Alpaca 条目 */
  items: AlpacaItem[];
  /** 错误信息 */
  error?: string;
  /** 分块进度 */
  chunksDone: number;
  /** 总块数 */
  chunksTotal: number;
  /** 块内已生成条数 */
  totalItems: number;
}

/** 批量处理结果 */
export interface BatchResult {
  /** 总文件数 */
  totalFiles: number;
  /** 成功文件数 */
  successFiles: number;
  /** 失败文件数 */
  failedFiles: number;
  /** 总生成的 Alpaca 条目 */
  totalItems: number;
  /** 各文件结果 */
  files: Array<{
    fileName: string;
    fileType: string;
    status: "done" | "error";
    items: AlpacaItem[];
    itemCount: number;
    error?: string;
  }>;
}

// -------------------- 全覆盖提取（分块） --------------------

/** 文档分块 */
export interface TextChunk {
  /** 块 ID，如 "chunk_001" */
  id: string;
  /** 块内文本内容 */
  text: string;
  /** 在原文档中的起始偏移量 */
  startOffset: number;
  /** 在原文档中的结束偏移量 */
  endOffset: number;
  /** 块序号（从 1 开始） */
  index: number;
  /** 分块数量 */
  total: number;
  /** 章节标题（如 "3.1 实验方法"），可能为空 */
  heading?: string;
}

/** 全覆盖提取的块级进度 */
export interface ChunkProgress {
  /** 当前完成块数 */
  done: number;
  /** 总块数 */
  total: number;
  /** 本轮块中新增的 QA 数量 */
  newItems: number;
  /** 累计 QA 数量 */
  totalItems: number;
  /** 当前块 ID */
  currentChunkId: string;
}

/** 去重阶段的进度 */
export interface DedupProgress {
  /** 去重前数量 */
  before: number;
  /** 去重后数量 */
  after: number;
  /** 被合并/移除的数量 */
  removed: number;
}

/** 全覆盖提取的 SSE 事件 */
export interface SSEChunkEvent {
  type: "chunk";
  progress: ChunkProgress;
}

export interface SSEDedupEvent {
  type: "dedup";
  progress: DedupProgress;
}

export interface SSEFullExtractDoneEvent {
  type: "done";
  sessionId: string;
  totalChunks: number;
  totalItems: number;
}

export type FullExtractSSEEvent = SSEChunkEvent | SSEDedupEvent | SSEFullExtractDoneEvent | SSEErrorEvent;
