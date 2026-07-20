# Checklist

## 设计系统
- [x] 使用 oklch 色彩空间定义所有颜色变量
- [x] 颜色数量 ≤ 4（强调色 + 中性灰阶 + 前景/背景）
- [x] 字体家族 ≤ 2（Newsreader 衬线 + Plus Jakarta Sans 无衬线），JetBrains Mono 仅用于标签/编号
- [x] Hero 标题与正文比例 ≥ 6×
- [x] 间距遵循 8pt 网格（8/16/24/32/48/64/96/128）
- [x] 动效缓动曲线使用 cubic-bezier(0.22, 1, 0.36, 1)

## 反 AI 俗套
- [x] 无紫粉蓝渐变背景
- [x] 无左边框强调卡片
- [x] 无 emoji 作为图标
- [x] 无虚构数据/假 logo 墙/虚假推荐语
- [x] 无渐变光球表示"AI"
- [x] 图片占位使用诚实的 `[需要真实图片]` 标记

## 内容完整性
- [x] Hero 首屏包含作者名、英文标识、定位标语、滚动引导
- [x] About 简介区域呈现个人定位与工程哲学
- [x] 三个项目按 EvidenceFlow Studio → ArchPilot → Doc2Alpaca 顺序展示
- [x] 每个项目包含：编号、中英双语名、标语、描述、技术栈标签、关键特性、图片占位区
- [x] Contact 页脚包含作者名、邮箱（mailto）、个人定位
- [x] 项目内容与三个项目 README 信息一致

## 动效与交互
- [x] Hero 文字交错进入动画
- [x] 滚动触发渐显动画（IntersectionObserver，阈值 15%）
- [x] 项目卡片悬停：阴影提升 + 图片缩放 + 标签色彩过渡
- [x] 项目详情可展开/收起，同时仅展开一个
- [x] 顶部导航滚动时背景模糊与当前章节高亮
- [x] 自定义光标（桌面端）悬停可交互元素时变化
- [x] 主题切换平滑过渡（300ms）

## 功能性
- [x] 主题切换偏好存储至 localStorage 并自动加载
- [x] 首次访问尊重系统 prefers-color-scheme
- [x] 尊重 prefers-reduced-motion，减少动效用户仅保留透明度
- [x] 所有链接与交互可正常工作
- [x] 控制台无错误
- [x] Google Fonts 使用 display=swap 加载

## 响应式
- [x] 桌面端（≥1024px）多列布局，横向空间利用充分
- [x] 平板端（768–1023px）适当收窄
- [x] 移动端（<768px）单列布局，禁用自定义光标，字号 clamp 适配
- [x] 无横向滚动条

## 工程质量
- [x] 单页 HTML + CSS + JS，无构建步骤，双击 index.html 可运行
- [x] 仅依赖 Google Fonts CDN
- [x] 代码结构清晰，CSS 变量统一管理设计令牌
- [x] JS 模块化，事件绑定无内存泄漏
