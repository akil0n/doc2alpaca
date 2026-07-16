# Doc2Alpaca Web

一个面向浏览器的文档问答数据集生成与审核工具。支持 PDF、DOCX、PPTX、TXT、Markdown 和 HTML，输出 Alpaca 或 ShareGPT JSON。

## 特性

- 单文件与批量转换
- 分块提取、全局去重、来源证据与质量评分
- 问答检索、筛选、逐条审核和安全导出
- 深色模式、六套主题色及自定义全局主题色
- 轻量 CSS 动效，并自动适配“减少动态效果”和低刷新设备

## 本地运行

需要 Node.js 18.17 或更高版本。

```bash
npm install
cp .env.example .env.local
npm run dev
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env.local
npm.cmd install
npm.cmd run dev
```

打开 <http://localhost:3000>。

## 环境变量

```env
LLM_API_KEY=your-api-key-here
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o
```

不要提交 `.env.local`、真实 API Key、上传文档或生成的数据集。项目已通过 `.gitignore` 默认排除这些内容。

## 验证与生产运行

```bash
npm run typecheck
npm test
npm run build
npm start
```

## 部署

可直接导入 Vercel，或在支持 Node.js 的服务器中执行 `npm run build && npm start`。部署时请在平台的环境变量设置中配置 LLM 凭据。

## 目录

```text
app/          页面、样式和 API 路由
components/   界面组件
lib/          文档处理、问答生成、检索与导出逻辑
public/       静态资源
tests/        核心流程测试
types/        共享类型
workers/      浏览器检索 Worker
```

此上传版仅包含 Web 应用，不包含 Electron、安装包、构建产物或本地环境文件。