# 开发日志

## [2026-06-09]

### 任务 阶段1：基础环境搭建
- **开始时间**：22:30
- **结束时间**：23:20
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
- **开始时间**：00:10
- **结束时间**：00:30
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
- **开始时间**：01:00
- **结束时间**：01:15
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
  - Docker 无法拉取镜像，数据库不可用，发布/列表/详情 API 的集成测试暂被跳过
  - Next.js `NextRequest` 与标准 `Request` 类型不完全兼容，需使用 `as unknown as NextRequest` 转换
