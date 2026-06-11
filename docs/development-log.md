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