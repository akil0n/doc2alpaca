// Mock OpenAI 兼容 LLM 服务（本地演示用，无外部依赖）
// 返回固定 Alpaca JSON + finish_reason: "stop"，让 deepEngine 一轮自然完成
import { createServer } from "node:http";

const PORT = 8787;
const MAX_BODY_BYTES = 1_000_000;

const server = createServer((req, res) => {
  if (req.method !== "POST" || !req.url?.includes("/chat/completions")) {
    res.writeHead(404);
    res.end("not found");
    return;
  }

  let body = "";
  let bodyBytes = 0;
  let rejected = false;
  req.on("data", (chunk: Buffer) => {
    bodyBytes += chunk.length;
    if (bodyBytes > MAX_BODY_BYTES) {
      rejected = true;
      res.writeHead(413, { "content-type": "text/plain; charset=utf-8" });
      res.end("request body too large");
      req.destroy();
      return;
    }
    body += chunk.toString("utf8");
  });
  req.on("error", () => {
    if (!res.writableEnded) res.destroy();
  });
  req.on("aborted", () => {
    if (!res.writableEnded) res.destroy();
  });
  req.on("end", () => {
    if (rejected || res.writableEnded) return;
    console.log("[mock-llm] request:", body.slice(0, 120), "…");
    const items = [
      {
        instruction: "Doc2Alpaca 支持哪些文档格式？",
        input: "",
        output:
          "Doc2Alpaca 支持 PDF、Word（DOCX）、PPT（PPTX）、TXT、Markdown、HTML 等格式。",
      },
      {
        instruction: "Doc2Alpaca 的核心处理流程是什么？",
        input: "",
        output:
          "核心流程为：提取文本 → 构建 Prompt → 调用大模型 → 解析结果，生成 Alpaca 格式数据集。",
      },
    ];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: "mock-chat-1",
        model: "mock-llm",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({ items }),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 80, total_tokens: 130 },
      }),
    );
  });
});

server.listen(PORT, "127.0.0.1", () =>
  console.log(
    `[mock-llm] listening on http://localhost:${PORT}/v1/chat/completions`,
  ),
);
