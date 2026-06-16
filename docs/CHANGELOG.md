# Changelog

> 记录项目的重要变更。格式基于 [Keep a Changelog](https://keepachangelog.com/)。

## [Unreleased]

### Added

#### 图片灯箱移动端交互（双指缩放 + 拖动平移）
- 新增触摸事件处理：双指 pinch-to-zoom（0.2x–5x 无级缩放）
- 缩放后单指 drag-to-pan 平移图片，边界约束防止图片移出视口
- 拖动时使用 `window.innerWidth/Height` 计算最大偏移量 `(scale-1)*vw/2`
- 移除右上角关闭按钮（点击 overlay 背景即可关闭 + Escape 键盘）
- 移除过渡动画（`transition-transform duration-100` → `transition-none`），手势响应更即时
- caption 和底部信息添加 `pointer-events-none`，防止点击干扰关闭操作
- 添加 `touch-none select-none` 防止触摸时页面滚动或选中文字

#### AI 对话窗口响应式优化
- ChatButton 移动端缩小（`size-14`→`size-12`），适配 `safe-area-inset-bottom`
- ChatDrawer 移动端全屏覆盖（`max-md:inset-0 w-full`），桌面端保持侧滑抽屉
- 快速操作按钮由 `overflow-x-auto` 改为 `flex flex-wrap`，空间不足时自动换行成两行
- 拖拽手柄同时支持鼠标（`onMouseDown`）和触摸（`onTouchStart`）事件，平板端可拖拽调整宽度
- 消息气泡移动端宽度放宽（`max-w-[85%]`）
- 输入框移动端最小高度 44px，发送按钮 48px
- 底部适配 `safe-area-inset-bottom` 防止系统导航栏遮挡
- TextSelectionToolbar 移动端按钮触控热区提升至 `min-h-[44px]`

#### 重名草稿检测和返回按钮统一
- 新增 `GET /api/articles/draft/check-duplicate` API：上传前检测草稿 slug 是否已存在
- PublishForm 上传流程新增重名草稿确认对话框（黄色警告卡片），支持覆盖已有草稿
- 三个步骤标题左侧统一返回按钮（`size-9` ArrowLeft 图标）：
  - 上传页 → `/admin/articles`，草稿页 → `/admin/articles`，确认页 → 返回步骤二
- 移除 `/admin/articles/new` 和 `/admin/articles/[id]/edit` 页面级冗余返回按钮

#### AI 聊天对话窗口
- 新增 `/api/chat` 端点：SSE 流式响应，直接调用 DeepSeek API，支持文章上下文注入
- 新增 `ChatButton` 组件：右下角浮动聊天入口
- 新增 `ChatDrawer` 组件：右侧滑入抽屉，流式显示 AI 响应，支持选中内容上下文
- 新增 `TextSelectionToolbar` 组件：选择文本后浮动工具栏，"向 Miniese 提问"和"申请添加词条"
- 新增 `SelectionInfo` 类型，包含选中文本、周围段落、标题路径等上下文信息
- Settings 新增 `prompts.chat` 配置，博主可自定义 Miniese 角色 prompt

#### 阅读页 AI 功能
- 选中文本时自动计算所属标题层级（headingPath）和周围上下文（surroundingContext）
- ChatDrawer 选中内容卡片（sticky 固定在顶部）和 4 个快捷操作按钮（解释/翻译/举例/总结）
- 快捷按钮始终可见，不限于首次交互

#### 发布流程优化
- Settings 新增 `publish.defaultAuthor` 配置，PublishForm 从设置读取默认作者
- 语言选择改为必选，保存/提交/确认前进行校验
- 上传文件时从 frontmatter 提取标题、作者、标签、摘要；无 frontmatter 时从文件名推断标题
- 删除草稿页面内联 AI 审查卡片，点击审查后直接跳转到详情页

### Fixed

- KaTeX 公式选中后获取渲染字符而非 LaTeX 源码的问题
  - 选择包含公式的文本时（如 "$E = mc^2$"），`selection.toString()` 返回渲染后的 "E = mc²"
  - 修复：使用 `range.cloneContents()` 获取选中 DOM 片段，将 `.katex` 元素替换为 `<annotation>` 中的 LaTeX 源码
  - 支持跨区域选择（普通文本和公式混合），每个公式独立替换
- skipped 任务（feature disabled）在各处正确显示"已跳过"而非"已完成"
  - reviews 列表页：映射 status 为 "skipped"，黄色标签
  - reviews 详情页：跳过状态检测 + 显示 reason 提示卡片
  - ai-tasks 列表页：API 映射 + AiTaskList 兼容
  - ai-tasks 详情页：StatusBadge 跳过检测
- Notesaw block 容器移除 `border-radius: 8px`，恢复直角左侧竖线样式
- "编辑→"按钮文案改为"点击编辑草稿"，语义更清晰

### Changed

- 发布确认页不再硬编码 "博主"，使用 settings 中的 `publish.defaultAuthor`

#### 基础架构
- Next.js 16 + TypeScript 5 + Tailwind CSS 4 项目初始化
- Prisma 7.8 + PostgreSQL 16 + Redis 7 配置
- Docker Compose 开发环境编排
- 目录结构和配置文件

#### 文章系统
- Markdown/Notesaw 双渲染管线（统一渲染器，支持 KaTeX）
- 文章发布流程（上传、预览、元信息编辑、确认发布）
- 文章列表页（分页、标签筛选）
- 文章阅读页（正文、右侧 TOC 目录、阅读量、点赞数）
- 文章管理页（已发布文章 + 草稿绑定显示）

#### 知识库
- 词条 CRUD API 和文件管理
- 词条列表页和阅读页
- 词条链接检测（发布时自动替换为链接）
- 词条 hover 预览（悬停显示定义）

#### AI 功能
- DeepSeek API 封装（重试、超时、Token 记录）
- 队列基础设施（Bull + Redis + Worker）
- AI 文章审查（分块处理、结构化报告、历史存档）
- AI 增量翻译（双向、自动触发、译文标注）
- AI 词条发现（发布时扫描、候选审批）
- AI 词条生成（审批后自动生成完整词条）

#### 仪表盘
- 文章管理（列表、发布、编辑、删除）
- 词条管理（列表、创建、编辑、删除）
- 词条发现审批（批量操作、状态管理）
- 审查历史（列表页、详情页）
- 设置页面（常规、外观、功能开关、通知、编译器、Prompt 查看）
- 全局色彩系统（主题色/强调色可调、实时预览）

#### 前端
- 左侧导航栏 + 右上角 ActionBar（语言切换、暗色模式）
- 响应式布局（移动端基本可用）
- AI 生成内容背景色标注

### Planned

- 账号系统（注册、登录、OAuth、邮箱验证、密码找回）
- AI 对话窗口（读者与 Miniese 交互）
- 评论功能（登录后可评论）
- 词条申请（登录后可提交）
- 移动端体验优化