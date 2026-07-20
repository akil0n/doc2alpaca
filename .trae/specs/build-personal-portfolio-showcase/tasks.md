# Tasks

- [x] Task 1: 创建项目目录与基础文件结构
  - [x] SubTask 1.1: 在 `c:\Users\31085\Desktop\personal-portfolio\` 创建 `index.html`、`styles.css`、`script.js` 三个文件
  - [x] SubTask 1.2: 配置 Google Fonts 加载（Newsreader + Plus Jakarta Sans + JetBrains Mono），使用 `display=swap`

- [x] Task 2: 实现设计系统令牌与基础样式
  - [x] SubTask 2.1: 在 `styles.css` 定义 oklch 色彩变量、字号层级、间距系统、圆角、阴影层级（浅色/暗色双主题）
  - [x] SubTask 2.2: 实现全局重置、基础排版、滚动行为 `scroll-behavior: smooth`、自定义滚动条样式
  - [x] SubTask 2.3: 实现主题切换 CSS 变量过渡（300ms），暗色模式通过 `[data-theme="dark"]` 属性切换

- [x] Task 3: 构建 Hero 首屏区域
  - [x] SubTask 3.1: 实现全屏 Hero 布局，包含作者名"陈嘉豪"、英文标识、定位标语、滚动引导
  - [x] SubTask 3.2: Hero 文字使用 Newsreader 衬线大字号（clamp 8rem），交错进入动画（每个字符/词延迟 80ms）
  - [x] SubTask 3.3: 添加微妙的背景纹理（CSS 渐变/噪点）与底部滚动指示器动画

- [x] Task 4: 构建 About 简介区域
  - [x] SubTask 4.1: 实现简洁的左右分栏布局（左侧标题"关于"，右侧段落），桌面端横向利用空间
  - [x] SubTask 4.2: 段落内容：独立完成全流程的个人定位、技术兴趣、工程哲学
  - [x] SubTask 4.3: 滚动进入时左侧标题与右侧段落交错渐显

- [x] Task 5: 构建 Selected Works 精选作品区域
  - [x] SubTask 5.1: 实现区域标题"Selected Works / 精选作品"与大编号装饰
  - [x] SubTask 5.2: 实现项目卡片组件（编号、项目名中英双语、标语、描述、技术栈标签、关键特性列表、图片占位区）
  - [x] SubTask 5.3: 三个项目按 EvidenceFlow Studio → ArchPilot → Doc2Alpaca 顺序排列，卡片依次进入视口时交错动画
  - [x] SubTask 5.4: 卡片悬停效果：阴影提升、图片占位缩放、标签色彩过渡
  - [x] SubTask 5.5: 图片占位区显示 `[需要真实图片]` 与建议尺寸，有边框与纹理提示

- [x] Task 6: 实现项目详情展开交互
  - [x] SubTask 6.1: 点击项目卡片"查看详情"按钮，平滑展开详细架构亮点、生产验证、技术栈详情
  - [x] SubTask 6.2: 展开内容使用 max-height 过渡或 grid-template-rows 0fr→1fr 技巧，动画流畅
  - [x] SubTask 6.3: 同一时间仅展开一个项目详情，展开时自动收起其他

- [x] Task 7: 构建 Contact 页脚区域
  - [x] SubTask 7.1: 实现页脚布局，包含作者名、邮箱（mailto 链接）、个人定位一句
  - [x] SubTask 7.2: 邮箱悬停时强调色下划线滑入动效
  - [x] SubTask 7.3: 添加版权声明与年份

- [x] Task 8: 实现滚动触发动画系统
  - [x] SubTask 8.1: 使用 IntersectionObserver 监听元素进入视口（阈值 15%），添加 `.is-visible` 类触发动画
  - [x] SubTask 8.2: 实现多种进入动画：上移渐显、交错延迟、视差位移（不同速度层）
  - [x] SubTask 8.3: 尊重 `prefers-reduced-motion`，减少动效用户仅保留透明度过渡

- [x] Task 9: 实现自定义光标与微交互
  - [x] SubTask 9.1: 桌面端实现自定义光标（小圆点 + 悬停时放大圆环），悬停可交互元素时变化
  - [x] SubTask 9.2: 主题切换按钮：图标平滑过渡，点击时涟漪反馈
  - [x] SubTask 9.3: 顶部导航：滚动时背景模糊 + 边框淡入，当前章节高亮

- [x] Task 10: 实现主题切换与持久化
  - [x] SubTask 10.1: 主题切换按钮绑定事件，切换 `data-theme` 属性
  - [x] SubTask 10.2: 偏好存储至 localStorage，页面加载时读取并应用
  - [x] SubTask 10.3: 首次访问尊重系统 `prefers-color-scheme`

- [x] Task 11: 响应式适配
  - [x] SubTask 11.1: 桌面端（≥1024px）：多列布局、横向空间利用、自定义光标启用
  - [x] SubTask 11.2: 平板端（768–1023px）：适当收窄，保持双栏
  - [x] SubTask 11.3: 移动端（<768px）：单列布局、禁用自定义光标、字号 clamp 适配、简化动效

- [x] Task 12: 最终验证与打磨
  - [x] SubTask 12.1: 验证所有交互（导航、详情展开、主题切换、mailto 链接）正常工作
  - [x] SubTask 12.2: 验证控制台无错误，字体已加载，无布局抖动
  - [x] SubTask 12.3: 验证 reduced-motion 与移动端体验

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3–7 依赖 Task 2
- Task 8–10 可与 Task 3–7 并行开发（动效系统与内容区域解耦）
- Task 6 依赖 Task 5
- Task 11 依赖 Task 3–7 完成
- Task 12 依赖所有前置任务
