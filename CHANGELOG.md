# Changelog

> 本项目的所有重要变更记录。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
> 版本号遵循 [Semantic Versioning](https://semver.org/)。

## [Unreleased]

### Added
- 阶段 8：账号系统（注册、登录、密码管理、邮箱验证、个人设置）
- 阶段 8：评论系统（API + CommentSection 前端组件，跨版本互通，60s 频率限制）
- 阶段 8：UI 优化（button cursor-pointer，登录页重定向逻辑改进）
- 阶段 5.6：AI Prompt 自定义集成（设置页高级 tab 编辑 prompt，4 个 AI 函数支持）
- 阶段 5.6：设置页"恢复默认"按钮（所有字段旁一键恢复）
- 阶段 5.5：Wiki 管理界面重构（统一状态栏、EntryRow/DiscoveryCard 按钮）
- 阶段 5.4：词条发现引擎（discoverWikiCandidates，自动触发发布/翻译后）
- 阶段 5.3：行级增量翻译引擎（translator2.ts，detectChanges→splitRange→context→AI）
- 阶段 5.2：增量审查引擎（reviewer.ts，复用通用 pipeline + draftOfId 解析）
- 阶段 9（Phase 9）：图片管理前端集成——PublishForm 上传页新建流程简化、Step 2 后退按钮修复、保存按钮加回
- 阶段 9：Draft API 支持 `draftId` 参数直接更新草稿
- 阶段 9：图片验证 API（`GET /api/articles/images/[id]/verify`）+ ImageValidationStatus 组件
- 阶段 9：图片 URL 相对路径修复（Server-side 重写 + Client-side fallback）
- 阶段 9：上传时检测重名草稿（`GET /api/articles/draft/check-duplicate`）+ 确认对话框

### Changed
- 阶段 8：认证从 MVP 简单密码保护升级为 NextAuth.js v5（Credentials + 可选 OAuth）
- 阶段 8：仪表盘路由保护方式更新（HTTP Basic Auth → NextAuth.js session）
- 阶段 8：废弃的 `/admin/reviews` 迁移到 `/admin/ai-tasks`
- 阶段 5.6：预览区明度硬编码修复（改为 CSS 变量引用）
- 阶段 5.3：翻译详情页 UI 重写（上下文嵌入 card，全局 Eye/EyeOff 控制）
- 阶段 5.2：发布流程审查集成（审查按钮仅出现在草稿编辑页）
- 阶段 9：PublishForm 返回按钮统一——三个步骤顶部带紧凑返回按钮（`size-9`），移除编辑页和新建页的重复返回 Link

### Fixed
- 阶段 8：登录页 callbackUrl 默认值（`/admin` → `/`）
- 阶段 8：session 刷新问题（`router.push` → `window.location.href`）
- 阶段 8：评论频率限制跨翻译版本（通过 originalId 解析根文章）
- 阶段 5.4：详情页"暂无定义"（worker processDiscover 返回缺少 definition）
- 阶段 5.4：重复词条问题（WikiDiscovery 表添加唯一约束，filterPendingProposals 全状态检查）
- 阶段 5.2：增量审查不工作（draftOfId 解析）
- 阶段 5.2：草稿记录未删除（publish API 使用 delete 而非 update）
- 阶段 5.2：孤立草稿问题（审查按钮移除恢复现场）
- 阶段 3.3：Wiki 阅读页 URL 编码 404（decodeParam 解码）

## [0.5.0] — 2026-06-12

### Added
- AI Prompt 自定义集成（loadCustomPrompt + 设置页高级 tab）
- 设置页"恢复默认"按钮（所有字段）
- 词条发现引擎 + 自动触发（发布/翻译后）
- Wiki 管理界面重构（状态标签栏、按钮统一）
- 撤销链路（/api/wiki/[name]/undo、/api/admin/discoveries/[id]/undo）
- 行级增量翻译引擎（translator2.ts）
- 增量审查引擎（reviewer.ts）
- 通用 chunker pipeline（splitArticle、splitRange、detectChanges、buildContext）

### Fixed
- 预览区明度不更新（CSS 变量引用）
- 详情页"暂无定义"（worker 缺少 definition 字段）
- 重复词条（唯一约束 + 全状态检查）
- 增量审查不工作（draftOfId 解析）
- 草稿记录未删除（publish API 修复）
- 孤立草稿（审查按钮位置调整）
- 刷新后审查状态丢失（useEffect 恢复）

## [0.4.0] — 2026-06-11

### Added
- 文章管理页面删除/编辑按钮（ArticleRowActions、StatusBadge）
- 全站语言切换（Globe 图标 + cookie + 中间件重定向）
- Dark/Light 主题完善（ThemeToggle + FOUC-prevention）
- 右侧目录导航（TableOfContents，scroll + offsetTop，缓动动画）
- 文末区域（版权 CC BY-NC 4.0、Changelog 占位、评论占位）
- Wiki 链接检测 + 悬停预览（WikiPreview 组件，300ms hover，5min 缓存）
- 文章刷新词条链接按钮（preserveUpdatedAt 参数）
- 词条 CRUD API + 生命周期状态管理
- Wiki 管理界面（列表页 + 详情页）
- 词条发现提案列表页（/admin/wiki/discoveries）
- KaTeX 数学公式渲染
- Notesaw 完整渲染管线（block/inline-block/box 语法）

### Changed
- 文章详情页布局（flex：内容区 + TOC sidebar，max-w-3xl → max-w-5xl）
- PublishForm 三步骤拆分（上传页 → 草稿页 → 确认页）
- WikiEntry 模型重新设计（status 字段替代布尔字段）
- 词条文件存储格式（frontmatter + HTML 注释分隔区块）
- 中间件排除列表（/styles/、/icon/）

### Fixed
- Next.js 16 Turbopack 下 params.name URL 编码问题（decodeParam）
- linkDetector 中 CJK 边界检测、全角标点处理
- rehypeStringify 转义 HTML 实体（allowDangerousHtml: true）

## [0.3.0] — 2026-06-10

### Added
- 发布流程步骤一：上传页（PublishForm 多步骤表单，tag chip 输入）
- 草稿保存/编辑 API（POST /api/articles/draft）
- 文章删除 API（POST /api/articles/delete）
- 创建草稿 API（POST /api/articles/create-draft）
- buildFrontmatter 工具函数（UI 元信息写入文件 frontmatter）
- 仪表盘草稿页优化（显示在文章下方、空草稿占位行、修改时间/行数/字符数）
- 集成测试覆盖：发布、删除、创建草稿

### Changed
- 草稿文件命名统一为 slug
- ArticleMeta 新增 slug 保留逻辑
- 新文章发布后草稿关联（draftOfId）

### Fixed
- buildFrontmatter 中 slug 丢失问题

## [0.2.0] — 2026-06-10

### Added
- 文章基础 CRUD API（upload/preview/publish/list/detail）
- renderedContent 字段（HTML 渲染缓存）
- 84 个测试（单元 57 + 集成 27）
- Prisma schema：Article 模型（contentType、viewCount、likes、draftOfId）

## [0.1.0] — 2026-06-09

### Added
- 项目初始化（Next.js 16.2.7 + TypeScript 5 + Tailwind CSS 4）
- shadcn/ui v4（base-nova 风格，Neutral 主题）
- Prisma 7.8.0 + PostgreSQL 16（Docker Compose）
- Redis 7（Docker Compose）
- 完整目录结构
- Markdown 渲染器（标准 Markdown + Notesaw 双管线）
- 41 个渲染器单元测试（100% 覆盖率）
- 配置 Vitest、ESLint、Prettier
- `.env.example`
