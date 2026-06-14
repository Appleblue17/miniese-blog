# 测试记录

> 面向Agent的测试参考记录文档。

### 阶段 8：账号系统 + 评论系统 + UI 优化

**更新时间**：2026-06-14
**文件**：`src/auth.ts`、`src/lib/mail.ts`、`src/types/auth.ts`、`src/app/(public)/login/`、`src/app/(public)/register/`、`src/app/(public)/forgot/`、`src/app/(public)/reset/`、`src/app/(public)/verify/`、`src/app/(public)/settings/`、`src/app/api/auth/`、`src/app/api/comments/`、`src/components/article/CommentSection.tsx`
**变更**：
- NextAuth.js v5 认证系统（Credentials + 可选 Google/GitHub OAuth，JWT session）
- 注册/登录/忘记密码/重置密码/邮箱验证/个人设置页面
- 评论 API（GET 获取、POST 发表，60s 频率限制，跨翻译版本互通）
- CommentSection 前端组件（精简输入框 → 展开表单，未登录跳转登录页）
- Proxy 中间件 session 保护（admin 路由检查 role）
- UI 优化（cursor-pointer 修复）
- 清理废弃 reviews 页面（迁移到 ai-tasks）
**总览**：`npx tsc --noEmit` 编译通过

### 阶段 5.6：AI Prompt 自定义集成 + 设置页"恢复默认"按钮

**更新时间**：2026-06-13
**文件**：`src/lib/ai/promptLoader.ts`、`src/lib/ai/reviewer.ts`、`src/lib/ai/translator2.ts`、`src/lib/ai/discovery.ts`、`src/lib/ai/generator.ts`、`src/app/(dashboard)/admin/settings/page.tsx`
**变更**：
- `loadCustomPrompt(key)` 从设置 DB 读取自定义 prompt
- 4 个 AI 函数（review/translate/discovery/generate）接受自定义 prompt 参数
- Worker 中 4 个 handler 调用 loadCustomPrompt 并透传
- 设置页高级 tab 可编辑 prompt textarea
- 所有设置字段旁添加"恢复默认"按钮
- Bug 修复：预览明度不更新（硬编码明度改为 CSS 变量引用）
**总览**：`npx tsc --noEmit` 编译通过，未新增测试

### 阶段 5.4+5.5：Wiki 发现 + 管理界面重构

**更新时间**：2026-06-12
**文件**：`src/lib/ai/discovery.ts`、`src/lib/ai/generator.ts`、`src/lib/ai/discovery.test.ts`、`src/worker.ts`、`src/app/(dashboard)/admin/wiki/`、`src/app/api/wiki/[name]/undo/`、`src/app/api/admin/discoveries/`
**变更**：
- 词条发现引擎（discoverWikiCandidates）：统一 chunking pipeline，长文章分块，去重合并
- 过滤现有词条/提案逻辑（filterExistingWikiEntries / filterPendingProposals）
- processDiscover worker handler + 自动触发（发布/翻译后）
- Wiki 管理界面按钮统一：EntryRow（通过/撤销/编辑/删除）、DiscoveryCard（同意/撤销/重试）
- 后端撤销链路（/api/wiki/[name]/undo、/api/admin/discoveries/[id]/undo）
**总览**：**301 测试，296/301 通过**（5 个预存集成测试因外部服务不可用跳过）
- discovery 单元测试：10/10
- discovery 集成测试：14/14

### 阶段 5.2+5.3：Review + 翻译增量架构

**更新时间**：2026-06-12
**文件**：`src/lib/ai/reviewer.ts`、`src/lib/ai/translator2.ts`、`src/lib/ai/translator2.test.ts`、`src/lib/ai/reviewer.test.ts`、`src/lib/ai/chunker/`
**变更**：
- translator2.ts：行级增量翻译引擎（detectChanges → splitRange → buildContext → AI）
- reviewer.ts：增量审查引擎（复用通用 pipeline + draftOfId 解析）
- 修复：增量审查不工作（draftOfId 解析）、草稿记录未删除、新文章流程孤立草稿、刷新后审查状态丢失
**总览**：**266/272 通过**（6 个预存集成测试因外部服务不可用跳过）
- translator2 单元测试：25/25
- reviewer 单元测试：21/21
- review_roundtrip 集成测试：2/2

### 阶段 4：队列基础设施

**更新时间**：2026-06-11
**文件**：`src/lib/queue/client.ts`、`src/lib/queue/producer.ts`、`src/worker.ts`、`src/app/api/ai/review/route.ts`、`src/app/api/ai/status/[taskId]/route.ts`
**变更**：
- Bull 队列初始化（`ai-tasks` 队列，Redis 连接，默认重试 3 次）
- 任务生产者 `addJob()`：创建 `AiTask` DB 记录 → 入队 → 返回 `taskId`
- Worker 独立进程：4 种任务占位处理（review/translate/generate/scan）+ DB 状态更新
- `POST /api/ai/review` API 路由（提交审查任务）
- `GET /api/ai/status/[taskId]` API 路由（轮询任务状态）
- `npm run worker` 脚本（`tsx src/worker.ts`）
**需前置服务**：PostgreSQL + Redis（`docker compose up -d`）
**总览**：**172/172 全部通过**（单元 113 + 集成 59），0 跳过

| 文件 | 类型 | 数量 | 说明 |
|------|------|------|------|
| `tests/integration/queue.test.ts` | 集成测试 | 7 | 创建任务/状态查询/隔离队列 E2E |
| `src/lib/articles/frontmatter.test.ts` | 单元测试 | 16 | frontmatter 解析、slug 生成 |
| `src/lib/markdown/renderer.test.ts` | 单元测试 | 41 | Markdown/Notesaw 渲染 |
| `src/lib/markdown/linkDetector.test.ts` | 单元测试 | 23 | 词条链接检测 |
| `src/lib/wiki/parser.test.ts` | 单元测试 | 20 | 区块解析、build、slugify |
| `src/components/wiki/WikiPreview.test.tsx` | 单元测试 | 7 | 悬停预览弹窗 |
| `src/app/api/ai/status/[taskId]/route.test.ts` | — | 0 | （无独立单元测试，通过集成测试覆盖） |
| `tests/integration/queue.test.ts` | 集成测试 | 7 | 队列核心功能（producer/status/E2E） |
| `tests/integration/articles-render.test.ts` | 集成测试 | 4 | 手动重新渲染 API |
| `tests/integration/wiki-crud.test.ts` | 集成测试 | 13 | 词条 CRUD API |
| `tests/integration/articles-publish.test.ts` | 集成测试 | 5 | 发布草稿 |
| `tests/integration/articles-upload.test.ts` | 集成测试 | 4 | 上传 .md 文件 |
| `tests/integration/articles-preview.test.ts` | 集成测试 | 6 | 渲染预览 |
| `tests/integration/articles-list.test.ts` | 集成测试 | 8 | 分页列表筛选 |
| `tests/integration/articles-detail.test.ts` | 集成测试 | 4 | 文章详情 |
| **合计** | | **172** | **全部通过** |

### 阶段 3：知识库（基础版）—— 3.2 + 3.3（完整版）

**更新时间**：2026-06-11
**文件**：`src/lib/markdown/linkDetector.ts`、`src/components/wiki/WikiPreview.tsx`、`src/app/api/articles/render/route.ts`、`src/app/(public)/[lang]/wiki/[name]/page.tsx`
**变更**：
- 词条链接检测 + 悬停预览组件
- Wiki 阅读页 URL 编码 Bug 修复（添加 `decodeParam` 处理）
- 新增 `POST /api/articles/render` 手动重新渲染 API（含 `preserveUpdatedAt` 参数）
- 文章管理页新增"刷新词条链接"按钮
**总览**：**165/165 全部通过**（单元 107 + 集成 58），0 跳过

| 文件 | 类型 | 数量 | 说明 |
|------|------|------|------|
| `src/lib/markdown/linkDetector.test.ts` | 单元测试 | 23 | 词条链接检测（ASCII/CJK/边界/避免嵌套） |
| `src/components/wiki/WikiPreview.test.tsx` | 单元测试 | 7 | 悬停预览弹窗（hover/缓存/样式） |
| `src/lib/markdown/renderer.test.ts` | 单元测试 | 41 | Markdown/Notesaw 渲染 |
| `src/lib/articles/frontmatter.test.ts` | 单元测试 | 16 | frontmatter 解析、slug 生成 |
| `src/lib/wiki/parser.test.ts` | 单元测试 | 20 | 区块解析、build、slugify |
| `tests/integration/articles-render.test.ts` | 集成测试 | 4 | 手动重新渲染 API |
| `tests/integration/wiki-crud.test.ts` | 集成测试 | 13 | 词条 CRUD API |
| `tests/integration/articles-publish.test.ts` | 集成测试 | 5 | 发布草稿 |
| `tests/integration/articles-upload.test.ts` | 集成测试 | 4 | 上传 .md 文件 |
| `tests/integration/articles-preview.test.ts` | 集成测试 | 6 | 渲染预览 |
| `tests/integration/articles-list.test.ts` | 集成测试 | 8 | 分页列表筛选 |
| `tests/integration/articles-detail.test.ts` | 集成测试 | 4 | 文章详情 |

### 阶段 3a：发布流程步骤一——上传页

**更新时间**：2026-06-10
**文件**：`tests/integration/articles-publish.test.ts`
**变更**：新增 1 个回归测试修复（slug 保留逻辑）
**总览**：**84/84 全部通过**（单元 57 + 集成 27），0 跳过

| 文件 | 类型 | 数量 | 说明 |
|------|------|------|------|
| `src/lib/articles/frontmatter.test.ts` | 单元测试 | 16 | frontmatter 解析、slug 生成 |
| `src/lib/markdown/renderer.test.ts` | 单元测试 | 41 | Markdown/Notesaw 渲染 |
| `tests/integration/articles-upload.test.ts` | 集成测试 | 4 | 上传 .md 文件到 drafts |
| `tests/integration/articles-preview.test.ts` | 集成测试 | 6 | Markdown/Notesaw 渲染为 HTML |
| `tests/integration/articles-publish.test.ts` | 集成测试 | 5 | 发布草稿（文件移动 + DB 写入） |
| `tests/integration/articles-list.test.ts` | 集成测试 | 8 | 分页列表、tag/lang 筛选 |
| `tests/integration/articles-detail.test.ts` | 集成测试 | 4 | 文章详情 + 渲染 HTML |

### 阶段 2.2：文章基础 CRUD

**更新时间**：2026-06-10
**总览**：**83/83 全部通过**（单元 57 + 集成 26），0 跳过
