# 个人项目展示集 Spec

## Why

用户已完成三个高质量个人项目（ArchPilot 架构领航、EvidenceFlow Studio、Doc2Alpaca），需要一个具有高级审美与设计感的个人作品集站点，将作品以富有动效与流畅体验的方式呈现出来，作为对外展示个人能力与工程品味的窗口。

## What Changes

- 新建一个独立的个人作品集站点（单页应用），以 HTML + CSS + 原生 JS 实现，便于直接部署
- 设计方向：编辑级极简主义（Editorial Minimalist），融合 Apple HIG 留白哲学 + Stripe Press 文档质感 + Linear 微交互细节
- 包含 4 个核心区域：Hero 首屏、About 简介、Selected Works 精选作品（3 个项目）、Contact 联系方式
- 每个项目卡片留出明确的图片占位区域（使用诚实的 `[需要真实图片]` 占位符），由用户后续自行填充
- 丰富的滚动触发动效：进入视口渐显、视差位移、磁性悬停、交错动画、自定义光标
- 响应式设计：桌面端横向利用空间，移动端优雅降级
- 支持浅色/暗色双主题切换（默认浅色，尊重 Apple HIG 偏好）

## Impact

- Affected specs: 无（新建项目）
- Affected code: 新建独立目录 `c:\Users\31085\Desktop\personal-portfolio\`，与现有三个项目解耦
- 依赖：仅依赖 Google Fonts CDN，无构建步骤，双击 `index.html` 即可运行

## ADDED Requirements

### Requirement: 个人作品集站点

系统 SHALL 提供一个单页 HTML 作品集站点，展示三个个人项目，具有高级审美、设计感与丰富的动效体验。

#### Scenario: 用户首次访问
- **WHEN** 访客打开站点
- **THEN** 看到 Hero 首屏，包含作者名（陈嘉豪）、英文标识、一句定位标语、滚动引导动效，首屏文字以交错动画依次进入

#### Scenario: 滚动浏览作品
- **WHEN** 访客向下滚动至 Selected Works 区域
- **THEN** 三个项目卡片依次以渐显 + 上移动画进入视口，每个卡片包含编号、项目名（中英双语）、标语、描述、技术栈标签、关键特性、图片占位区

#### Scenario: 悬停项目卡片
- **WHEN** 访客将鼠标悬停在项目卡片上
- **THEN** 卡片产生微妙的提升阴影、图片占位区轻微缩放、技术栈标签色彩过渡，营造可点击的交互暗示

#### Scenario: 查看项目详情
- **WHEN** 访客点击项目卡片或"查看详情"
- **THEN** 以平滑过渡展开/弹出更详细的项目信息（架构亮点、技术栈、生产验证等），不离开当前页面

#### Scenario: 主题切换
- **WHEN** 访客点击主题切换按钮
- **THEN** 站点在浅色（暖白）与暗色（近黑）之间平滑过渡，所有元素颜色同步切换，偏好记忆在 localStorage

#### Scenario: 移动端访问
- **WHEN** 访客使用移动设备访问
- **THEN** 布局自适应为单列，字体大小适配，动效保留但简化以保证性能

### Requirement: 设计系统

系统 SHALL 遵循编辑级极简主义设计系统，具体设计令牌如下：

#### 色彩（oklch 色彩空间）
- 浅色模式：背景 `oklch(0.98 0.004 80)` 暖白；前景 `oklch(0.18 0.012 80)` 近黑；强调色 `oklch(0.62 0.18 35)` 琥珀橙
- 暗色模式：背景 `oklch(0.14 0.008 80)` 暖黑；前景 `oklch(0.96 0.004 80)` 暖白；强调色 `oklch(0.70 0.16 35)`
- 中性灰阶 6 级，用于次要文字、边框、分隔线

#### 字体
- 标题展示字：`Newsreader`（衬线，有编辑感与人格）— 用于 Hero 标题与项目名
- 正文：`Plus Jakarta Sans`（无衬线，清爽现代）— 用于段落与 UI
- 代码/标签：`JetBrains Mono`（等宽）— 用于技术栈标签与编号

#### 字号层级
- Hero 标题：`clamp(3rem, 10vw, 8rem)`，与正文比例 ≥ 6×
- 项目名：`clamp(2rem, 5vw, 3.5rem)`
- 段落正文：`1rem` / `1.125rem`
- 标签/元信息：`0.75rem` 大写字间距

#### 间距系统
- 8pt 网格：8 / 16 / 24 / 32 / 48 / 64 / 96 / 128

#### 圆角策略
- 卡片：24px（大圆角，柔和）
- 标签/按钮：8px（小圆角，精确）
- 图片占位：16px

#### 阴影层级
- Elevation 1（卡片静态）：`0 1px 2px rgba(0,0,0,0.04)`
- Elevation 2（卡片悬停）：`0 12px 32px rgba(0,0,0,0.08)`
- Elevation 3（详情展开）：`0 24px 64px rgba(0,0,0,0.12)`

#### 动效风格
- 缓动曲线：`cubic-bezier(0.22, 1, 0.36, 1)`（Apple HIG 标准）
- 进入动画时长：600–900ms
- 悬停反馈时长：300–400ms
- 滚动触发：使用 IntersectionObserver，元素进入视口 15% 时触发
- 尊重 `prefers-reduced-motion`：减少动效用户仅保留透明度过渡

### Requirement: 项目内容呈现

系统 SHALL 按以下结构呈现三个项目（顺序按完成度与影响力）：

#### 项目 01：EvidenceFlow Studio（垂域大模型工作流）
- 标语：端到端 LLM 评测数据生产流水线
- 描述：为 LLM 评测自动生成高难度垂域分析型题目，附带暗色主题交互式 Web 展示平台
- 亮点：四阶段模块化管线、去AI化检测引擎（30 硬禁词 + 11 正则 + 7 软警告）、三层去重（SHA256→SimHash→Jaccard）、47 个自动化测试
- 技术栈：Next.js 16, TypeScript, FastAPI, Tailwind CSS, shadcn/ui, Framer Motion, Pydantic
- 状态：生产验证通过，迭代 12+ 轮

#### 项目 02：ArchPilot 架构领航（v0.7.0）
- 标语：把模糊想法变成 AI 可执行架构
- 描述：帮助 AI 编程新手把文本/文件分析类工具想法，转成可交付 LLM 分阶段编码的设计包
- 亮点：三层机制（需求翻译→架构设计→LLM 执行）、8 套设计风格配方（Linear/Apple HIG/Aesop/Vercel/MUJI/Raycast/Stripe Press/Bloomberg）、反 AI 俗套规则、设计 Token 全程传递
- 技术栈：Skill-based Framework, YAML 驱动, oklch 色彩系统, CSS 自定义属性
- 状态：v0.7.0，UI 设计系统升级完成

#### 项目 03：Doc2Alpaca（文档转数据集工具）
- 标语：文档转 LLaMA-Factory 数据集工具
- 描述：上传 PDF/Word/TXT/Markdown/HTML，通过 LLM 智能解析生成 Alpaca 格式 JSON 数据集
- 亮点：模块化单体架构、支持 6 种文档格式、Apple HIG 风格 UI、Electron 桌面应用、v8-compile-cache 启动优化、分块提取覆盖大文件
- 技术栈：Next.js 14, TypeScript, Tailwind CSS, Electron, pdf-parse, mammoth
- 状态：v0.1.0 已发布桌面安装包

### Requirement: 图片占位策略

系统 SHALL 为每个项目保留图片展示区域，使用诚实的占位符策略：

- 占位区显示 `[需要真实图片]` 文字提示与建议尺寸说明
- 占位区有明确的视觉边框与微妙背景纹理，提示用户此处待填充
- 占位区尺寸：桌面端 16:10 比例，宽度填满卡片内容区
- 用户后续可直接替换为真实截图，无需修改布局代码

### Requirement: 联系信息

系统 SHALL 在页脚呈现作者联系信息：

- 作者名：陈嘉豪
- 邮箱：3108547812@qq.com（可点击 mailto 链接）
- 一句个人定位：独立完成从需求分析 → 系统设计 → 编码实现 → 质量保障 → 前端展示的全流程
