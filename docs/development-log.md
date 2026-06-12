# 开发日志

### 任务 阶段1：基础环境搭建
- **时间**：2026-06-09
- **状态**：✅ 完成
- **变更摘要**：
  - 1.1 初始化 Next.js 16.2.7 + TypeScript 5 + Tailwind CSS 4 项目
  - 1.2 配置 shadcn/ui v4（base-nova 风格，Neutral 主题），添加 button/card 组件
  - 1.3 配置 Prisma 7.8.0 + PostgreSQL 16（Docker Compose），创建完整 schema（Article/WikiEntry/ArticleWikiLink/AiTask/Comment）
  - 1.4 配置 Redis 7（Docker Compose）
  - 1.5 创建完整目录结构和示例文件
  - 1.6 配置 `.env.example`
- **测试结果**：Prisma schema 验证通过（valid），dev server 启动正常（284ms）
- **遇到的问题**：
  - npm registry 网络不稳定，切换为 npmmirror 后正常
  - Docker 当前环境未安装，无法实际启动容器，但配置已完成
  - Prisma 6 使用了新的 `prisma.config.ts` 配置方式，已适配

### 任务 阶段2.1：Markdown 渲染器集成
- **时间**：2026-06-09
- **状态**：✅ 完成
- **变更摘要**：
  - 移动 Notesaw 核心源码到 `packages/notesaw/` 并精简 transformer（移除 VS Code 专用代码）
  - 安装 unified/remark/rehype/katex 依赖
  - 实现 `src/lib/markdown/renderer.ts`：统一渲染器，支持 markdown 和 notesaw 两种管线
  - 配置 vitest
  - 编写 41 个单元测试（标准 Markdown、KaTeX、Notesaw block/inline-block/box/nested、Edge cases）
  - 注意：rehype-starry-night 因版本兼容性问题暂未集成
  - 新增 `docs/testing-guide.md`：测试运行指南
- **测试结果**：41/41 通过，覆盖率 100%
- **遇到的问题**：
  - `rehype-starry-night@2.2.0` + `@wooorm/starry-night@3.10.0` 存在 ESM 加载兼容问题，暂不启用
  - Notesaw 的 `parser.ts` 中 `import type` 路径需从 `./index.d.ts` 改为 `./index.ts`

### 任务 阶段2.2：文章基础 CRUD
- **时间**：2026-06-10
- **状态**：✅ 完成
- **变更摘要**：
  - 安装 gray-matter（frontmatter 解析）和 supertest（集成测试）依赖
  - Prisma schema 添加 `renderedContent` 字段用于缓存 HTML
  - 创建 `src/lib/articles/frontmatter.ts` + 16 个单元测试
  - 创建 5 个 API 端点：
    - `POST /api/articles/upload` — 上传 .md 文件到 drafts 目录
    - `POST /api/articles/preview` — 渲染 MD/Notesaw 内容为 HTML
    - `POST /api/articles/publish` — 发布草稿（文件移动 + 数据库写入）
    - `GET /api/articles` — 分页列表，支持 tag/lang 筛选
    - `GET /api/articles/[slug]` — 文章详情（元数据 + 渲染 HTML）
  - 创建 10 个集成测试（上传 4 个、预览 6 个）
  - 创建 16 个集成测试占位（发布 5 个、列表 7 个、详情 4 个，待数据库就绪后运行）
- **测试结果**：67/67 通过（单元测试 16 + 集成测试 10 + 渲染器 41），16 个数据库相关测试跳过
- **遇到的问题**：
  - Docker 镜像拉取失败（registry 网络问题），切换镜像源后恢复正常
  - Prisma 7.x 使用 `prisma-client` provider，需要 `@prisma/adapter-pg` 适配器
  - 集成测试中数据库可用性检查需在模块加载时同步执行（`describe` 在模块加载时评估），使用顶层 `await` 解决
  - Next.js `NextRequest` 与标准 `Request` 类型不完全兼容，需使用 `as unknown as NextRequest` 转换

### 任务 阶段2.2：集成测试修复 & 全部通过
- **时间**：2026-06-10
- **状态**：✅ 完成
- **变更摘要**：
  - Docker 启动成功（切换 registry 镜像源），PostgreSQL 16 + Redis 7 正常运行
  - 修复 `src/lib/db.ts`：使用 `PrismaPg` 适配器（Prisma 7.x 新架构）
  - 修复 3 个数据库依赖测试文件的数据库可用性检查：从 `beforeAll` 动态导入改为顶层 `await` 模式，确保 `describe` 评估时 `isDbAvailable` 已确定
  - 创建 `tests/integration/db-client.ts`：桥接模块用于动态导入 Prisma 客户端
  - 修复 publish 测试：添加 `beforeEach` 中清理 DB 残留数据，避免测试间污染
  - 修复 list 测试：`page=9999` 超出范围的 total 应为匹配总数而非 0
- **测试结果**：**83/83 全部通过**（单元测试 57 + 集成测试 26），0 跳过
  - frontmatter 单元测试：16/16
  - renderer 单元测试：41/41
  - upload 集成测试：4/4
  - preview 集成测试：6/6
  - publish 集成测试：5/5
  - list 集成测试：7/7
  - detail 集成测试：4/4

### 任务 阶段2.3：发布流程步骤一——上传页
- **时间**：2026-06-10
- **状态**：✅ 完成
- **变更摘要**：
  - 实现 `PublishForm.tsx`：上传 + 元信息 + 预览 + 存草稿/发布多步骤表单，包含 tag chip 输入
  - 实现 `POST /api/articles/upload`：支持文件上传和直接 `fileContent` 两种方式，返回解析的 frontmatter
  - 修复 tag 解析：从手写 regex 改为 `gray-matter` 解析 frontmatter，`buildFrontmatter` 输出内联 YAML 数组
  - 仪表盘草稿页优化：草稿显示在文章下方、空草稿占位行、增加修改时间/行数/字符数
  - 草稿文件命名统一为 slug（`draft/route.ts` 和 `publish/route.ts`）
  - 新文章发布后草稿关联：`publish/route.ts` 接收 `draftId`，发布后设置 `draftOfId`
  - `ArticleMeta` 新增 slug 保留逻辑：`buildFrontmatter` 从原始 frontmatter 保留 slug 字段
- **测试结果**：84/84 全部通过（新增 publish 测试回归修复）
- **遇到的问题**：
  - `buildFrontmatter` 中 slug 在 `MANAGED_FIELDS` 但不在 `ArticleMeta` 中导致 slug 丢失
  - 测试 `returns 409 when slug+language combination already exists` 因前次运行的 DB 残留记录失败
  - 修复：在 `buildFrontmatter` 中用 `parsedFrontmatter` 变量保留原始 frontmatter 的 slug

### 任务 阶段2.3：前端文章页面 — 样式与渲染修复
- **时间**：2026-06-11
- **状态**：✅ 完成
- **变更摘要**：
  - 修复 `/{lang}/articles` 列表页 API 错误处理和标题本地化（`ArticleList.tsx`）
  - 修复 proxy 中间件静态资源 404：将 `/styles/` 和 `/icon/` 路径加入排除列表（`src/proxy.ts`）
  - 添加 KaTeX、Notesaw（note.css）和 GitHub Markdown（github-markdown.css）三种样式文件到 `public/styles/`
  - 添加 Feather SVG sprite 到 `public/icon/`（Notesaw 图标支持），在 layout 中通过 `fs.readFileSync` 内联注入
  - layout 中添加 `github-markdown.css` 的 `<link>` 标签
  - layout 中注入 `data-theme` 属性到 `<html>`（SSR 默认 `"light"`），FOUC-prevention script 同步设置 `data-theme="dark"`/`"light"`，实现 github-markdown.css 的 dark/light 主题切换
  - `ArticleReader.tsx`：文章内容容器从 Tailwind `prose` 类改为 `markdown-body` 类，由 github-markdown.css 统一控制排版样式
  - `packages/notesaw/parser.ts`：root 节点移除 `hProperties: { class: "markdown-body" }`，避免 Notesaw 文章渲染时 HTML 嵌套两层 `markdown-body`
  - 修复 packages/notesaw 和 src 中多处 `.ts` 后缀导入问题（`allowImportingTsExtensions` 未启用）
- **测试结果**：84/84 全部通过，`next build` 成功
- **遇到的问题**：
  - Next.js 构建在 `allowImportingTsExtensions` 未启用时报 `.ts` 后缀导入错误，将所有 `import ... from "./foo.ts"` 改为无后缀
  - `notesaw-assets/` 目录（旧 Notesaw 资源）已移除，不需 gitignore
  - Notesaw 文章缺失 source file（原 `notesaw-assets/` 随目录删除），重新发布新 Notesaw 测试文章，清理旧数据库记录

### 任务 阶段2.3：前端文章页面 — 右侧目录导航 + 文末区域
- **时间**：2026-06-11
- **状态**：✅ 完成
- **变更摘要**：
  - 新增 `src/components/article/TableOfContents.tsx`：从 HTML 提取 h1/h2/h3，生成锚点 ID 并注入 DOM
  - 支持 HTML 实体解码（`&amp;` → `&`）、防重复 ID 生成（计数器）
  - 桌面端 sticky sidebar（xl:block），移动端底部浮动按钮 + bottom sheet 弹出层
  - IntersectionObserver 跟踪当前可见章节 → **后改为 scroll 事件（requestAnimationFrame throttle）+ offsetTop 计算**，更稳定
  - 点击跳转使用 `requestAnimationFrame` 自定义 easeInOutQuad 缓动（~300ms/1000px，上限 400ms），比浏览器默认 `behavior:"smooth"` 更快
  - 滚动锁定机制（`isScrollingRef`）防止跳转动画中途被 scroll/observer 干扰而"跳回去"
  - 跳转结束后立即 `setActiveId(id)` 更新目录高亮，再延迟 80ms 释放锁定
  - 目录项自动滚动到 active 项保持可见
  - 层级视觉区分：h1 粗体 → h2 中等 → h3 小字浅色缩进
  - 修改 `ArticleReader.tsx`：改为 `"use client"`，flex 布局（内容区 + TOC sidebar），新增文末区域（版权 CC BY-NC 4.0、Changelog、评论区占位），`max-w-3xl` → `max-w-5xl`
  - 修改 `page.tsx`：传递 `changelog` prop
- **测试结果**：`next build` 通过
- **遇到的问题**：
  - IntersectionObserver 在快速滚动时可能错过事件，导致目录高亮滞后 → 改用 scroll 事件 + offsetTop 计算，即时稳定

### 任务 阶段2.3：文章管理页面 — 删除与编辑按钮
- **时间**：2026-06-11
- **状态**：✅ 完成
- **变更摘要**：
  - 新增 `POST /api/articles/delete`：删除文章/草稿记录 + 关联文件，级联删除关联草稿、wikiLinks、comments
  - 新增 `POST /api/articles/create-draft`：从已发布文章复制文件创建草稿记录
  - 新增 `src/components/admin/ArticleRowActions.tsx`：客户端组件，处理所有交互
  - 新增 `src/components/admin/StatusBadge.tsx`：可复用状态标签
  - 删除确认模态框区分"文章"/"草稿"
  - 有草稿的已发布文章不再显示多余提示
  - 时间格式改为 24 小时制（hourCycle: "h23"）
- **测试结果**：`next build` 通过

### 任务 阶段2.3：全站语言切换 + Dark/Light 切换完善
- **时间**：2026-06-11
- **状态**：✅ 完成
- **变更摘要**：
  - Navbar sidebar 底部添加语言切换按钮（Globe 图标 + EN/中 标识），点击在 zh ↔ en 之间切换
  - 切换时设置 `preferred_lang` cookie（有效期 1 年）并刷新页面
  - 中间件（`proxy.ts`）已支持根据 cookie 重定向语言（之前已实现）
  - Dark/Light 切换（ThemeToggle 组件）已在 Navbar 底部存在，本次未改动
- **测试结果**：`next build` 通过

### 任务 阶段3.2+3.3：Wiki 链接检测 + 悬停预览组件
- **时间**：2026-06-11
- **状态**：✅ 完成
- **变更摘要**：
  - 实现 `src/lib/markdown/linkDetector.ts`：从文章 Markdown 内容检测 wiki 术语并按匹配位置插入 `<a>` 标签
  - 修复 3 个 term 匹配 bug（URL 编码、CJK 后边界检测、全角标点处理），添加 `isAsciiWordChar()` 辅助函数
  - `renderer.ts`：添加 `allowDangerousHtml: true` 使 `<a>` 标签通过 rehypeStringify
  - `publish/route.ts`：在渲染前调用 `detectWikiLinks`，DB 中 `renderedContent` 包含 wiki 链接
  - 新增 `POST /api/articles/render`：手动重新渲染（含 wiki 链接检测和注入）
  - 实现 `src/components/wiki/WikiPreview.tsx`：客户端组件，300ms hover 延迟、全局缓存（5min TTL）、事件委托、移动端无视、固定定位 + scroll/resize 重定位
  - 集成到 `ArticleReader.tsx`（`<WikiPreview lang={lang} />`）
- **测试结果**：164/164 全部通过（12 个测试文件）
  - `linkDetector.test.ts`：23/23
  - `WikiPreview.test.tsx`：7/7（jsdom + @testing-library/react）
  - `articles-render.test.ts`：4/4（集成测试）
  - 其余 130 个测试保持回归通过
- **遇到的问题**：
  - linkDetector 最初使用 `encodeURIComponent` 导致链接 URL 中空格编码，改为使用原始名称
  - rehypeStringify 默认转义 HTML 实体导致 `<a>` 标签被转义为文本，需设置 `allowDangerousHtml: true`
  - WikiPreview.test.tsx 使用 `@testing-library/react` 和 `jsdom`，需安装依赖并配置 vitest 以支持 `.tsx` 文件
  - vitest 默认 `fileParallelism: true` 导致测试间全局状态（`globalCache`）污染，设置为 `false`

### 任务 阶段3.2+3.3：Wiki 链接修复 + 刷新按钮
- **时间**：2026-06-11
- **状态**：✅ 完成
- **变更摘要**：
  - **Bug 修复**：wiki 阅读页 `/zh/wiki/文档` 返回 404。
    - 根因：Next.js 16 Turbopack 模式下 `params.name` 在页面组件中是 URL 编码的（`%E6%96%87%E6%A1%A3`），而 `slugifyName("%E6%96%87%E6%A1%A3")` 去除非 ASCII 字符后变成 `e69687e6a1a3`，查询不到数据库记录
    - 修复：在 `fetchEntry` 和页面组件入口添加 `decodeParam()` 函数对参数解码
  - **新增功能**：文章管理页已发布文章行右侧添加"刷新词条链接"按钮
    - `POST /api/articles/render` 新增 `preserveUpdatedAt` 参数，保持修改时间不变
    - 在 `ArticleRowActions.tsx` 中集成刷新按钮调用
  - 最终验证：165/165 测试全部通过，`npx next build` 编译成功
- **测试结果**：165/165 全部通过
  - `linkDetector.test.ts`：23/23 ✅
  - `WikiPreview.test.tsx`：7/7 ✅
  - `articles-render.test.ts`：4/4 ✅
  - 其余 131 个测试保持回归通过 ✅
- **遇到的问题**：
  - URL 编码问题：Next.js 16 Turbopack 的 `params.name` 在不同 API（page vs generateMetadata）中行为不一致
  - `slugifyName` 对非 ASCII 字符的处理导致 URL 编码后查询失败

### 任务 阶段5.3：AI 翻译引擎重构 — translator2.ts + 详情页适配
- **时间**：2026-06-12
- **状态**：✅ 完成
- **变更摘要**：
  - **translator2.ts**：纯行级 diff 管道的增量翻译引擎，替代旧的 chunk-content-comparison 方案。
    - `detectChanges(oldBody, newBody)` → `DiffBlock[]`：基于行级 diff 检测变化范围
    - `splitRange(lines, startLine, endLine)` → `Chunk[]`：按标题边界拆分 diff 块
    - `buildContext(diffBlock, lines)` → `{startLine, endLine}`：上下文窗口构建
    - `incrementalTranslate(...)` → `TranslateResult`：完整增量翻译流程
    - `translateFull(...)` 委托给 `incrementalTranslate("", ...)`（全量 = 增量的特殊情况）
    - `complementRanges()` / `replaceLines()` / `extractContent()` 辅助函数
    - `buildChunkPrompt()` / `parseTranslatedChunk()` Prompt 构建和解析
  - **单元测试**：25 个测试，覆盖全量翻译、增量翻译、部分变更、复用、空内容、frontmatter 保留、代码块、单行、文档顺序、边缘情况、多行 key 还原
  - **详情页重写**（`page.tsx` + `TranslateChunkList.tsx`）：
    - 增量模式：直接使用 `translatedGroups[i].targetLines` 按行号从源文件提取内容
    - 上下文（aboveContext/belowContext）嵌入到每个 target chunk card 内部
    - 全局按钮显示/隐藏上下文（右上角 Eye/EyeOff 图标）
    - 全量模式：整个文章作为一个 chunk 显示
    - 移除统计提示和 filter 下拉菜单
  - **Worker 翻译处理**（`processTranslate`）：
    - 从最新已完成任务加载 `existingTranslations`
    - Frontmatter 元数据翻译（title, summary 字段）
    - 译文写入目标语言文件 + 更新 DB 记录 + HTML 重新渲染
  - **Bug 修复**：
    - `reusedCount = 0` → 增加 `lineToTranslation` 映射，支持跨 key 子串搜索
    - 详情页 `buildTranslatedText` 找不到翻译 → 跨 key 子串搜索 fallback
    - 所有非 target chunks 标记为 context → 移除 context 标记逻辑
    - `stripFrontmatter` vs `matter(content).content` 前导换行不一致 → 统一用 `stripFrontmatter`
- **测试结果**：242/249 通过（7 个集成测试因外部服务不可用跳过）
- **遇到的问题**：
  - 行级还原问题：仅用 `existingTranslations`（multi-line key → translated text）做 line-level assembly 时，unchanged lines 找不到翻译
    - 根因：`existingTranslations` 的 key 是整个 sub-chunk 的内容（多行），而 unchanged 范围是单行
    - 修复：构建 `lineToTranslation` 映射，将每个 multi-line key 拆解为单行映射（source line → translated line）
  - 详情页 `findTranslationByContent` 精确匹配失败：target 内容可能是 larger key 的子串
    - 修复：使用跨 key 子串搜索（滑动窗口匹配）
  - `stripFrontmatter` 和 `matter(content).content` 输出不一致：前者保留 frontmatter 后的首个换行，后者去除
    - 修复：统一使用 `stripFrontmatter`

### 任务 阶段5.2：Review 管道迁移到统一增量架构
- **时间**：2026-06-12
- **状态**：✅ 完成
- **变更摘要**：
  - **reviewer.ts**：将 `processReview` 迁移到共享的 diff-based pipeline，与 translator2 架构一致。
    - `incrementalReview()` 复用 `detectChanges` + `splitRange` + `buildContext`
    - 复用策略：unchanged 范围复用 `existingChunks`，changed 范围通过 pipeline 发送给 AI
    - 返回 `contentSnapshot` + `contentMap` 供下次增量
  - **单元测试**：21 个 reviewer 单元测试 + 2 个 review_roundtrip 测试全部通过
- **测试结果**：266/272 通过（6 个预存在的集成测试因外部服务不可用跳过）
- **遇到的问题**：
  - review 和 translate 使用相同的标记约定（`[TRANSLATE_START]/[TRANSLATE_END]`），但 instruction 不同
  - Worker 需要区分 review 和 translate 任务的 output 格式

### 任务 阶段5.2：修复增量审查与发布流程
- **时间**：2026-06-12
- **状态**：✅ 完成
- **变更摘要**：
  - **Bug 1 — 增量审查不工作**：草稿的 `AiTask` 记录关联的是草稿的 articleId，但发布后创建了新的 article 记录
    - 根因：第二次审查（在已发布文章上）找不到第一次审查的 `contentSnapshot`
    - 修复（worker.ts）：在 `processReview` 中，如果文章有 `draftOfId`，使用已发布文章的 ID 查找上次审查记录
  - **Bug 2 — 草稿记录未删除**：发布 API 的 `draftId` 分支使用了 `update`（设置 `draftOfId`）而非 `delete`
    - 修复（publish/route.ts）：两个分支都使用 `prisma.article.delete({ where: { id: draftId } })`，在迁移 AiTask 记录后删除草稿
  - **Bug 3 — 新文章流程导致孤立草稿**：点击审查 → 自动创建草稿 → 用户留在上传页 → 点击发布 → 草稿被孤立
    - 修复前端：审查按钮从上传页移除，仅出现在草稿编辑页（步骤二）
    - 修复前端：上传页的审查按钮改为"创建草稿并审查"，重定向到草稿编辑页
    - 修复后端：`publish/route.ts` 新增守卫检查，如果 draft 已有 `draftOfId` 则拒绝（"请使用草稿编辑器发布"）
  - **Bug 4 — 刷新后审查状态丢失**：页面刷新后 `reviewSubmitted` 未恢复，按钮显示"交给助手审查"而非"已提交审查"
    - 修复（PublishForm.tsx）：在 `useEffect` 恢复审查状态时添加 `setReviewSubmitted(true)`
- **测试结果**：266/272 通过（6 个预存在的集成测试因外部服务不可用跳过）
- **遇到的问题**：
  - `draftOfId` 解析需要在 worker 中进行，因为 worker 不感知文章是否已被发布
  - 发布时迁移 AiTask 记录需要处理两种场景：draftOfId（更新已有文章）和 draftId only（首次发布）

### 任务 阶段5.4：Wiki-Discovery 整合与修复
- **时间**：2026-06-12
- **状态**：✅ 完成
- **变更摘要**：
  - **词条发现引擎 (Discovery)**: 扫描文章内容提取候选词条，存储在 `WikiDiscovery` 表中供博主审核。
    - `discoverWikiCandidates()` — 统一 chunking pipeline（splitArticle），长文章分块处理，去重合并
    - `filterExistingWikiEntries()` — 过滤已存在的 `WikiEntry` 记录（同语言）
    - `filterPendingProposals()` — 过滤已存在任何状态的 `WikiDiscovery` 提案
    - `processDiscover` worker handler — 读取文章 → AI 扫描 → 写入 `WikiDiscovery` 表
    - 10 个单元测试 + 14 个集成测试
  - **自动触发**: 发布文章时自动触发词条发现（`triggerAutoGenerate`），翻译完成后自动对译文文章触发发现（`processTranslate` step 11）
  - **前端列表页**: `/admin/wiki/discoveries/` — 词条发现提案列表，支持批量操作
  - **Bug 修复 — 详情页「暂无定义」**: `worker.ts:processDiscover()` 返回的 `candidates` 缺少 `definition` 字段。修复：在 `candidates.map()` 中加入 `definition: c.definition`
  - **Bug 修复 — 重复词条**: 两个根因：
    - `WikiDiscovery` 表缺少 `@@unique([articleId, term])` 约束 → 添加唯一约束 + 迁移
    - `filterPendingProposals()` 只检查 `pending` 状态 → 改为检查所有状态
  - **Prompt 修复 — 英文术语中文解释**: `definition` 语言与文章内容不匹配。修复：在 system/user prompt 中明确要求 definition 语言与文章一致
- **测试结果**：241/241 通过（discovery 单元测试 10 + 集成测试 14，其余回归通过）
- **遇到的问题**：
  - Worker 代码更新后需重启 Worker 进程才能生效，旧进程继续使用旧代码导致翻译后自动发现未触发
  - WikiDiscovery 唯一约束：初始有重复数据，迁移前需手动清理（`DELETE FROM "WikiDiscovery" WHERE id NOT IN (SELECT DISTINCT ON ("articleId", term) id FROM "WikiDiscovery")`）

### 任务 阶段5.5：Wiki 管理界面按钮统一与撤销回退链路
- **时间**：2026-06-12
- **状态**：✅ 完成
- **变更摘要**：
  - **UI 重构**: 将零散的 `/admin/wiki/discoveries/` 词条发现页与 `/admin/wiki/` 词条管理页合并为统一的 `AdminWikiList` 组件，新增状态标签栏（全部 / 申请中 / 生成中 / 待审查 / 已审查 / 生成失败 / 已删除）
  - **按钮行为统一**（按状态区分）：
    - `EntryRow`:
      - `creating` — 仅显示「撤销」（移至申请中）
      - `unreviewed` — 显示「通过」+「撤销」（移至申请中）+「编辑」+「删除」
      - `reviewed` — 显示「撤销审查」（移至待审查）+「编辑」+「删除」
      - `deleted` — 无操作按钮
    - `DiscoveryCard`:
      - `pending` — 显示「同意」+「删除」
      - `generated` — 显示「撤销」（回到申请中）
      - `failed` — 显示「撤销」（回到申请中）+「重试」
      - `rejected` — 显示「撤销删除」（回到申请中）
  - **后端撤销链路**：
    - `/api/wiki/[name]/undo` — 支持 `creating`（删除词条记录+文件，将 discovery 移回 pending）、`unreviewed`（同上）、`reviewed`（移回 `unreviewed`，更新文件 frontmatter）
    - `/api/admin/discoveries/[id]/undo` — 支持 `failed` discoveries（删除 WikiEntry 记录如存在，移回 pending）
  - **清理**：移除 `EntryRow` 中未使用的 `handleRetry` 死代码
- **测试结果**：301 测试，296/301 通过（5 个预存在的集成测试因外部服务不可用跳过），`npx tsc --noEmit` 编译通过
- **遇到的问题**：
  - 无新增问题