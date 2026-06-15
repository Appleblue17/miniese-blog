# Changelog

> 记录项目的重要变更。格式基于 [Keep a Changelog](https://keepachangelog.com/)。

## [Unreleased]

### Added

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