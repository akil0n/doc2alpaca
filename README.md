# Doc2Alpaca

**文档转 LLaMA-Factory 数据集工具**

上传 PDF、Word、TXT、Markdown、HTML 等格式文档，通过 LLM 智能解析生成 **Alpaca 格式（instruction/input/output）JSON 数据集**，直接用于 LLaMA-Factory 微调训练。

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置数据库、登录和加密密钥

复制 `.env.example` 并配置 PostgreSQL、`AUTH_SECRET`、`DATA_ENCRYPTION_KEY` 以及所需登录服务商，然后执行：

```bash
npx prisma migrate deploy
```

登录支持手机号、微信开放平台网站应用、QQ 互联和 GitHub；未配置凭据的方式会自动隐藏。完整配置与回调地址见 [登录与安全部署](docs/DEPLOYMENT_SECURITY.md)。

公开部署默认只允许内置白名单中的 HTTPS LLM 域名。用户自己的 Key 只以服务端密文保存，浏览器不会取回完整 Key。

### 3. 启动

```bash
npm run dev
```

浏览器打开 http://localhost:3000

### 4. 使用

1. 拖拽或点击上传文档
2. 点击"开始解析"
3. 等待 LLM 解析完成
4. 预览 Alpaca 数据集
5. 下载 JSON 文件

---

## 支持的文档格式

| 格式 | 文件扩展名 | 解析引擎 |
|------|-----------|---------|
| PDF | `.pdf` | pdf-parse |
| Word | `.docx` | mammoth |
| 纯文本 | `.txt` | 原生读取 |
| Markdown | `.md`, `.markdown` | marked |
| HTML | `.html`, `.htm` | HTML 清洗 |

最大文件大小：**10MB**。上传文件使用当前登录用户绑定的一次性 `uploadId`，提取到内存后立即删除；后台清理器每 10 分钟删除超过 30 分钟的孤儿文件，新上传也会触发清理；无常驻进程的平台仍需配置平台 Cron。

---

## 输出格式

标准 **Alpaca 格式**，每个条目包含三个字段：

```json
[
  {
    "instruction": "总结文档的主要内容",
    "input": "（文档内容摘要段落）",
    "output": "文档主要讨论了..."
  }
]
```

可直接用于 LLaMA-Factory：

```bash
llamafactory-cli train \
  --dataset alpaca_dataset.json \
  --dataset_format alpaca
```

---

## 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **LLM 调用**: OpenAI 兼容 API
- **文档解析**: pdf-parse, mammoth, marked

## 架构说明

本项目采用**模块化单体**架构，核心模块：

| 模块 | 职责 |
|------|------|
| `lib/textExtractor` | 文档文本提取 |
| `lib/promptBuilder` | Alpaca 格式 Prompt 构建 |
| `lib/aiClient` | LLM API 调用 |
| `lib/resultParser` | 结果解析与字段校验 |
| `lib/orchestrator` | 业务流程编排 |
| `lib/exportService` | JSON 下载与剪贴板导出 |
| `lib/configService` | 环境变量配置读取 |

架构原则：**责任完整，不是技术复杂** — 覆盖完整应用责任，但不引入微服务、多租户、企业权限等复杂设计。

---

## 后续扩展

已预留接口，v1 不做：

- **批量处理** — 一次上传多个文档
- **ShareGPT 格式** — 多轮对话数据集导出
- **自定义 Instruction 模板** — 用户自定义 prompt
- **历史记录** — 保存转换记录

---

## License

MIT

## 安全与隐私

- 所有上传、分析、进度、配置和历史接口均校验登录用户与资源归属。
- 原始文档只用于当前任务，提取完成、失败或连接中断后都会删除；历史由服务端创建，仅加密保存 Alpaca 三字段生成结果，不保存原文证据或原文件名。
- 用户 API Key、配置、手机号和生成结果使用服务端认证加密；OAuth 令牌不持久化，第三方账户 ID 哈希化保存。
- 上传内容会发送给所选 LLM 服务商；第三方留存规则以其协议为准。
- 多实例或 Serverless 生产环境仍需把本地 `.tmp` 替换为带生命周期策略和恶意文件扫描的共享对象存储。

部署清单、回调地址和密钥管理要求见 [docs/DEPLOYMENT_SECURITY.md](docs/DEPLOYMENT_SECURITY.md)。
