# Miniese's Blog — API 文档

> 共 **75 个 API 路由**，分为 5 大模块

| 模块 | 数量 | 说明 |
|------|------|------|
| **Auth**（认证） | 9 | 注册/登录/密码/OAuth/个人资料 |
| **Public**（公开） | 16 | 文章/评论/聊天/标签/图片/词条 |
| **AI**（AI 任务） | 6 | 发现/生成/翻译/审稿/状态轮询/词条精炼 |
| **Admin**（管理） | 31 | 文章/词条/评论/AI 任务/发现/通知/用户/设置/媒体 |
| **Cron**（定时） | 1 | 自动链接 |

---

## 目录

- [1. 认证 API](#1-认证-api)
- [2. 公开文章 API](#2-公开文章-api)
- [3. 评论 API](#3-评论-api)
- [4. 词条 API](#4-词条-api)
- [5. 标签 API](#5-标签-api)
- [6. AI 聊天 API](#6-ai-聊天-api)
- [7. 图片服务 API](#7-图片服务-api)
- [8. AI 任务 API](#8-ai-任务-api)
- [9. 管理后台 API](#9-管理后台-api)
- [10. 定时任务 API](#10-定时任务-api)
- [通用约定](#通用约定)

---

## 1. 认证 API

### `GET /api/auth/[...nextauth]`

NextAuth 统一路由处理器。处理登录/登出/回调/session/CSRF/提供商列表等。

### `GET /api/auth/me`

获取当前登录用户信息。

**响应**：`{ user: { id, name, email, username, roles } }` 或 `{ user: null }`

### `POST /api/auth/register`

用户注册（用户名 + 密码，无需邮箱）。

**请求**：`{ username, password, name? }`

**响应 201**：`{ message, username }`

**错误**：`400` — 无效输入 / `409` — 用户名已存在

### `POST /api/auth/forgot`

发送密码重置邮件。仅对已绑定邮箱的用户有效。

**请求**：`{ username | email }`

**响应**：`{ message, noEmail? }`

### `POST /api/auth/reset`

使用令牌重置密码。

**请求**：`{ token, password }`

**响应**：`{ message }`

### `PUT /api/auth/update-password`

更新密码（需登录）。

**请求**：`{ currentPassword, newPassword }`

**响应**：`{ message }`

### `PUT /api/auth/update-profile`

更新昵称（需登录）。

**请求**：`{ name }`

**响应**：`{ message }`

### `GET /api/auth/verify`

邮箱验证（兼容遗留功能）。

**查询**：`?token=xxx`

**响应**：`{ message, email }`

### OAuth 账号管理

| 方法 | 路由 | 说明 |
|------|------|------|
| `GET` | `/api/auth/oauth/accounts` | 列出已绑定的 OAuth 提供商 |
| `POST` | `/api/auth/oauth/link` | 绑定 OAuth 账号 `{ provider, providerAccountId, access_token?, refresh_token? }` |
| `POST` | `/api/auth/oauth/unlink` | 解绑 OAuth 账号 `{ provider }` |

---

## 2. 公开文章 API

### `GET /api/articles`

分页获取已发布的文章列表。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `lang` | `zh\|en` | 是 | 语言 |
| `page` | number | 否 | 页码（默认 1） |
| `limit` | number | 否 | 每页条数（默认 10，最大 100） |
| `tag` | string | 否 | 单标签过滤（旧版兼容） |
| `q` | string | 否 | 全文搜索（标题/摘要/标签） |
| `tagFilter` | string | 否 | 包含标签（逗号分隔，AND 逻辑） |
| `tagExclude` | string | 否 | 排除标签（逗号分隔） |

**响应**：`{ articles: [...], total, page, totalPages }`

**特性**：隐藏文章不会出现在列表中（`isHidden: false`），置顶文章排序在前。

### `GET /api/articles/[slug]`

获取单篇文章详情（含渲染后的 HTML）。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `lang` | `zh\|en` | 是 | 语言 |
| `fields` | `meta\|body` | 否 | 仅返回元数据或仅返回 HTML |

**响应**：`{ article: {...metadata}, html: string }`

**特性**：
- 隐藏文章 → 非管理员返回 404
- `accessGroup` 权限检查 → 无权限返回 403
- 自动检测缺少 heading ID 的缓存并重新渲染（rehype-slug 补偿）
- 相对图片路径自动重写为 `/api/images/{articleId}/{filename}`

### `POST /api/articles/[slug]/view`

增加文章阅读数（两语言版本同时增加）。

**查询**：`?lang=zh|en`

**响应**：`{ success, viewCount }`

### `POST /api/articles/[slug]/toggle-hidden`

切换文章隐藏状态（管理操作）。

隐藏/取消隐藏会**同时作用于所有语言版本**（原文 + 所有 AI 翻译版本），保持多语言一致性。

**查询**：`?lang=zh|en`（可选，默认 `zh`，仅用于定位文章）

**响应**：`{ isHidden: boolean }`

### `POST /api/articles/[slug]/toggle-pinned`

切换文章置顶状态（管理操作）。

置顶/取消置顶会**同时作用于所有语言版本**（原文 + 所有 AI 翻译版本），保持多语言一致性。

**查询**：`?lang=zh|en`（可选，默认 `zh`，仅用于定位文章）

**响应**：`{ isPinned: boolean }`

### `POST /api/articles/upload`

上传 .md 文件，解析 frontmatter，保存到草稿目录。

**请求**：`multipart/form-data` — `file` (File), `saveAsDraft?` ("true"/"false"), `draftOfId?` (string)

**响应**：`{ success, fileName, fileContent, meta, extraFrontmatter, draftId? }`

### `POST /api/articles/publish`

发布草稿文章。将草稿目录移动到 `content/articles/{lang}/{slug}/`，创建/更新数据库记录，渲染 HTML，清理草稿，可选触发 AI 任务。

**请求**：`{ fileName, language, meta, slug?, changelog?, draftOfId?, fileContent?, draftId? }`

**响应**：`{ success, article: { id, slug, url } }`

**特性**：可选择触发 AI 翻译和词条发现任务。

### `POST /api/articles/preview`

预览 Markdown/Notesaw 内容渲染结果。

**请求**：`{ content, contentType?: "markdown"|"notesaw" }`

**响应**：`{ html, metadata: { title, tags, summary, contentType } }`

### `POST /api/articles/render`

重新渲染已发布文章的 HTML（含词条链接检测）。

**请求**：`{ articleId, lang, preserveUpdatedAt? }`

**响应**：`{ success, article: { id, slug } }`

### `POST /api/articles/delete`

删除文章（含翻译、草稿、关联文件）。

**请求**：`{ id }`

**响应**：`{ success }`

### `POST /api/articles/create-draft`

从已发布的文章创建草稿（复制目录 + images/）。

**请求**：`{ articleId }`

**响应**：`{ success, draft: { id, slug, url } }`

### `POST /api/articles/draft`

保存前端编辑器草稿（含 frontmatter 构建）。

**请求**：`{ fileName?, fileContent, meta?, draftOfId?, draftId?, language? }`

**响应**：`{ success, draft: { id, slug, url } }`

### `GET /api/articles/draft/check-duplicate`

检查草稿 slug 是否已存在。

**查询**：`?slug=xxx&excludeDraftId=xxx`

**响应**：`{ exists: boolean, draft?: { id, title, updatedAt } }`

### `GET /api/articles/content`

获取文章原始 Markdown 内容。

**查询**：`?id=xxx&download=1`

**响应**（正常）：`{ content, fileName }`
**响应**（下载）：`Content-Disposition: attachment` 文件流

### 图片管理（文章）

| 方法 | 路由 | 说明 |
|------|------|------|
| `GET` | `/api/articles/images/[id]` | 列出文章 images/ 目录 + 权限覆盖信息 |
| `POST` | `/api/articles/images/[id]` | 上传图片（multipart/form-data） |
| `PATCH` | `/api/articles/images/[id]` | 更新图片权限 `{ filename, accessGroup }` 或文章默认权限 `{ defaultImageAccessGroup }` |
| `DELETE` | `/api/articles/images/[id]?filename=xxx` | 删除图片 |
| `POST/GET` | `/api/articles/images/[id]/verify` | 验证文章中引用的图片是否存在 |

---

## 3. 评论 API

### `GET /api/comments?articleId=xxx`

获取文章的评论列表（跨语言共享评论区）。

**查询**：`?articleId=xxx`

**响应**：`[{ id, authorName, content, createdAt }]`

### `POST /api/comments`

发布评论（需登录）。

**请求**：`{ articleId, content }`

**响应 201**：创建的评论对象

**特性**：60 秒频率限制，自动通知管理员。

---

## 4. 词条 API

### `GET /api/wiki`

分页获取词条列表。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `lang` | `zh\|en` | 是 | 语言 |
| `page` | number | 否 | 页码 |
| `limit` | number | 否 | 每页条数 |
| `status` | string | 否 | 状态过滤（默认显示 `unreviewed,reviewed`） |
| `tag` / `q` / `tagFilter` / `tagExclude` | string | 否 | 搜索/过滤 |

**响应**：`{ entries: [...], total, page, totalPages }`

### `POST /api/wiki`

创建新的词条发现（手动申请成为词条）。

**请求**：`{ name, language, overrideDefinition? }`

**响应 201**：`{ discovery: { id, term, type, definition, importance, status, createdAt }, refined: boolean }`

**特性**：重复检查、AI 精炼（可选跳过）。

### `GET /api/wiki/[name]`

获取单条词条详情（含所有解析后的区块）。

**查询**：`?lang=zh|en`

**响应**：`{ entry: { ...meta, blocks: { definition, human, ai, ref } } }`

### `PUT /api/wiki/[name]`

更新词条内容。

**查询**：`?lang=zh|en`

**请求**：`{ name?, aliases?, definition?, human?, ai?, ref?, tags?, accessGroup? }`

**响应**：`{ entry: WikiEntryMeta }`

### `DELETE /api/wiki/[name]`

软删除词条（状态设为 `deleted`）。

**查询**：`?lang=zh|en`

**响应**：`{ success, entry }`

### 词条状态管理

| 方法 | 路由 | 说明 |
|------|------|------|
| `POST` | `/api/wiki/[name]/review` | 审查通过 `unreviewed → reviewed` |
| `POST` | `/api/wiki/[name]/complete` | 完成创建 `creating → unreviewed` |
| `POST` | `/api/wiki/[name]/retry` | 重试 AI 生成 |
| `POST` | `/api/wiki/[name]/undo` | 撤销（reviewed→unreviewed 或删除+恢复发现） |
| `POST` | `/api/wiki/[name]/approve` | **已弃用**（返回 410） |

### 其他词条 API

| 方法 | 路由 | 说明 |
|------|------|------|
| `GET` | `/api/wiki/content?name=xxx&lang=zh` | 获取词条原始 Markdown 内容 |
| `POST` | `/api/wiki/proposals` | 提交词条申请（需登录，5 分钟 3 次限制） |
| `GET` | `/api/wiki/proposals?status=pending` | 列出词条申请（管理员） |

---

## 5. 标签 API

### `GET /api/tags`

获取所有标签（聚合自文章和词条）。

**查询**：`?type=article|wiki|all&lang=zh|en`

**响应**：`{ tags: string[] }`

---

## 6. AI 聊天 API

### `POST /api/chat`

与 Miniese 进行 SSE 流式对话。

**请求**：
```json
{
  "messages": [{ "role": "user|assistant", "content": "..." }],
  "selection": {
    "text": "选中的文本",
    "surroundingContext": "上下文",
    "articleTitle": "文章标题",
    "articleExcerpt": "文章摘要（可选）",
    "headingPath": "所在标题路径"
  }
}
```

**响应**：SSE 流，事件格式为 `data: {"content": "..."}`，完成时 `data: [DONE]`

**特性**：IP 频率限制（10 秒 5 次）、消息限制（20 条）、总长度限制（8000 字符）、Token 用量自动记录。

---

## 7. 图片服务 API

### `GET /api/images/[articleId]/[filename]`

提供文章图片文件。

**特性**：
- 草稿 → 仅管理员可访问
- 已发布 → 检查 `ArticleImageOverride` 权限，回退到 `defaultImageAccessGroup`
- 支持 JPG/PNG/GIF/WebP/SVG/AVIF
- 一年缓存（`Cache-Control: public, max-age=31536000, immutable`）
- 目录遍历防护

---

## 8. AI 任务 API

| 方法 | 路由 | 说明 |
|------|------|------|
| `POST` | `/api/ai/review` | 提交 AI 审稿任务 `{ articleId }` |
| `POST` | `/api/ai/translate` | 提交 AI 翻译任务 `{ articleId, sourceLanguage, targetLanguage }` |
| `POST` | `/api/ai/discover` | 提交词条发现任务 `{ articleId }` |
| `POST` | `/api/ai/generate` | 提交词条生成任务 `{ articleId }` |
| `POST` | `/api/ai/refine-term` | AI 精炼词条（非持久化）`{ name, language }` |
| `GET` | `/api/ai/status/[taskId]` | 查询任务状态 |

**所有任务响应 201**：`{ taskId }`
**状态查询响应**：`{ id, type, status, input, output, error, createdAt, completedAt, articleId }`

---

## 9. 管理后台 API

> 所有管理 API 均受 `proxy.ts` 中间件保护（需 admin 身份）。

### 9.1 文章管理

#### `GET /api/admin/articles`

分页获取已发布文章（含草稿/翻译/任务状态）。

**查询**：`?page=1&limit=15`

**响应**：
```json
{
  "articles": [...],
  "translations": [...],
  "drafts": [...],
  "newDrafts": [...],
  "pendingTasks": { "articleId": ["review", "translate"] },
  "total": number,
  "page": number,
  "totalPages": number
}
```

#### `POST /api/admin/articles/render-all`

批量重新渲染文章（含词条链接检测）。

**请求**：`{ articleIds?: string[], olderThanDays?: number }`

**响应**：`{ total, succeeded, failed, errors, linkUpdatedCount }`

**特性**：`olderThanDays` 参数可过滤出超过指定天数未检测链接的文章。

#### `GET /api/admin/articles/link-status`

获取文章词条链接状态。

**查询**：`?articleIds=id1,id2`

**响应**：
```json
{
  "articles": [{ "id", "slug", "title", "language", "linkCount", "lastDetectedAt", "isStale", "hasRenderedContent", "wikiEntryCount" }],
  "totalWikiEntries": number,
  "staleThresholdDays": 7
}
```

#### `POST /api/admin/articles/auto-link`

自动重新渲染链接过期的文章。需要 `features.autoLink.enabled: true`。

**查询**：`?dryRun=true`

**响应**：`{ enabled, total, reRendered, needsUpdate, skipped, errors }`

### 9.2 AI 任务管理

| 方法 | 路由 | 说明 |
|------|------|------|
| `GET` | `/api/admin/ai-tasks` | 列出 AI 任务（分页、按 type/articleId 过滤） |
| `POST` | `/api/admin/ai-tasks/batch` | 批量操作 `{ action: "retry"|"delete", taskIds }` |
| `DELETE` | `/api/admin/ai-tasks/[id]` | 删除单个任务（含 Bull 队列清理） |
| `POST` | `/api/admin/ai-tasks/[id]/retry` | 重试失败/跳过的任务 |

### 9.3 词条管理（发现/提议）

#### 发现记录（WikiDiscovery）

| 方法 | 路由 | 说明 |
|------|------|------|
| `GET` | `/api/admin/discoveries` | 列出发现记录（分页、按状态/lang/type/articleId 过滤） |
| `POST` | `/api/admin/discoveries` | 批量操作 `{ action: "approve"|"reject", ids? | articleId? | ... }` |
| `POST` | `/api/admin/discoveries/[id]/approve` | 批准发现 → 创建词条 + 入队生成任务 |
| `POST` | `/api/admin/discoveries/[id]/reject` | 拒绝发现 |
| `POST` | `/api/admin/discoveries/[id]/retry` | 重试失败的生成 |
| `POST` | `/api/admin/discoveries/[id]/undo` | 撤销已生成的发现 |
| `POST` | `/api/admin/discoveries/[id]/undo-reject` | 撤销拒绝（恢复为 pending） |

**批准流程**：
1. 检查词条是否已存在（`409` 冲突）
2. 在磁盘上创建 `.md` 文件
3. 创建 `WikiEntry` 记录（状态 `creating`）
4. 更新发现状态为 `approved`
5. 入队 `generate` 任务

**批量批准**支持两种模式：
- 按 ID 列表：`{ ids: [...] }`
- 按条件：`{ articleId?, minImportance?, maxImportance?, limit?, type? }`

#### 用户提议（WikiProposal）

| 方法 | 路由 | 说明 |
|------|------|------|
| `POST` | `/api/admin/proposals/[id]/approve` | 批准提议 → AI 评估 → 创建发现 |
| `POST` | `/api/admin/proposals/[id]/reject` | 驳回提议 |

### 9.4 Token 用量监控

| 方法 | 路由 | 说明 |
|------|------|------|
| `GET` | `/api/admin/ai/tokens/summary?days=30` | 汇总：本月/上月/按类型/每日用量 |
| `GET` | `/api/admin/ai/tokens/recent?limit=50` | 最近 AiUsageLog 记录 |
| `POST` | `/api/admin/ai/check-tokens` | 月度告警检查（创建通知） |

**`GET /summary` 响应**：
```json
{
  "currentMonth": { "total", "promptTokens", "completionTokens" },
  "previousMonth": { "total" } | null,
  "perType": [{ "type", "total", "percentage" }],
  "dailyUsage": [{ "date", "total" }],
  "thisMonthTotal": number
}
```

**`POST /check-tokens` 响应**：
```json
{
  "month": "2026-07",
  "totalTokens": 123456,
  "limit": 10000000,
  "usagePercent": 1.23,
  "level": "ok|warning|critical",
  "notificationCreated": boolean,
  "count": 42
}
```

**阈值来源**：从 `settings.ai` 读取（`monthlyTokenLimit`, `warningThreshold`, `criticalThreshold`），默认值 10000000 / 0.7 / 0.9。

### 9.5 评论管理

| 方法 | 路由 | 说明 |
|------|------|------|
| `GET` | `/api/admin/comments` | 分页列出所有评论（含文章/用户信息） |
| `DELETE` | `/api/admin/comments/[id]` | 删除评论 |
| `PUT` | `/api/admin/comments/[id]/hide` | 切换评论可见性 `{ hidden: boolean }` |

### 9.6 通知管理

| 方法 | 路由 | 说明 |
|------|------|------|
| `GET` | `/api/admin/notifications` | 分页获取通知（支持 `?unreadOnly=true`） |
| `PUT` | `/api/admin/notifications/[id]/read` | 标记为已读 |
| `PUT` | `/api/admin/notifications/read-all` | 标记所有 🔴🟡 通知为已读 |
| `PUT` | `/api/admin/notifications/read-all-auto` | 标记所有 🔵 通知（自动读类型）为已读 |

**通知类型与自动读行为**：
- 🔴 重级别（`task_failed`）：`autoRead: false`
- 🟡 中级别（`comment`, `comment_deleted`）：`autoRead: false`
- 🔵 通知级别（`translation_complete`, `discovery`）：`autoRead: true`

### 9.7 用户管理

| 方法 | 路由 | 说明 |
|------|------|------|
| `GET` | `/api/admin/users` | 分页列出所有用户（含 `hasApiToken` 字段） |
| `PUT` | `/api/admin/users/[id]/role` | 添加/移除角色 `{ action: "add"|"remove", role: "admin" }` |
| `POST` | `/api/admin/users/[id]/reset-password` | 重置用户密码 `{ password? }` |
| `POST` | `/api/admin/users/[id]/api-token` | 生成/重新生成 API Token |

#### `POST /api/admin/users/[id]/api-token`

为指定用户生成 API Token（`mb_` 前缀的 64 位 hex 字符串）。

Token 以 bcrypt 哈希后存储在数据库，响应中返回原始 token **仅此一次**。

**响应**：
```json
{
  "token": "mb_a1b2c3d4e5f6...",
  "message": "API Token 已为用户 xxx 生成"
}
```

**用途**：生成的 Token 可用于 `Authorization: Bearer <token>` 头访问管理 API，无需浏览器 session（如自动化脚本、Miniese bot 调用）。Token 验证在 `proxy.ts` 中间件中处理，仅 admin 角色的用户 token 有效。

### 9.8 设置

| 方法 | 路由 | 说明 |
|------|------|------|
| `GET` | `/api/admin/settings` | 获取当前设置（合并后 + 默认 prompts） |
| `PUT` | `/api/admin/settings` | 更新设置 |

### 9.9 媒体管理

| 方法 | 路由 | 说明 |
|------|------|------|
| `GET` | `/api/admin/media?dir=/images` | 列出目录下文件（含图片尺寸） |
| `POST` | `/api/admin/media` | 上传文件（multipart/form-data） |
| `PUT` | `/api/admin/media` | 创建文件夹 `{ dir }` |
| `PATCH` | `/api/admin/media` | 重命名 `{ path, newName }` |
| `DELETE` | `/api/admin/media?path=xxx` | 删除文件/文件夹 |

**支持的文件类型**：`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico`

**安全措施**：
- 目录遍历防护（所有路径会被 normalize 并检查是否在 `public/` 内）
- 文件名清理（仅保留安全字符）

---

## 10. 定时任务 API

### `GET /api/cron/auto-link`

自动链接 Cron 端点。供 [cron-job.org](https://cron-job.org)、UptimeRobot 等外部服务定时调用。

**功能**：
1. 检查 `features.autoLink.enabled` 开关
2. 扫描所有已发布的原始文章（非翻译）
3. 根据 `intervalDays` 阈值判断哪些文章需要重新检测链接
4. 重新渲染并更新数据库

**查询**：`?dryRun=true`

**响应**：
```json
{
  "enabled": true,
  "total": 50,
  "reRendered": 3,
  "needsUpdate": 3,
  "skipped": 47,
  "errors": ["Article 'foo' (abc123): error message"]
}
```

**dryRun 模式**：`?dryRun=true` 时不实际渲染，仅报告需要更新的文章列表。

---

## 通用约定

### 认证

- 管理 API：通过 `proxy.ts` 中间件或内部的 `auth()` 调用检查 admin 角色
- 公开 API：部分需要登录（评论、提议），部分完全开放（文章列表、词条列表）

### 错误格式

```json
{ "error": "错误描述" }
```

| 状态码 | 含义 |
|--------|------|
| `400` | 参数错误 |
| `401` | 未登录 |
| `403` | 无权限 |
| `404` | 资源不存在 |
| `409` | 冲突（重复/状态不符） |
| `410` | 已废弃 |
| `429` | 频率限制 |
| `500` | 服务器内部错误 |
| `502` | AI 服务不可用 |
| `503` | 功能未启用 |

### 分页格式

所有列表接口统一：

```json
{
  "...data...": [...],
  "total": number,
  "page": number,
  "totalPages": number
}
```

### 通用查询参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | number | 页码，最小 1（默认 1） |
| `limit` | number | 每页条数（默认值因接口而异，最大 100） |
| `q` | string | 全文搜索关键词 |
| `tag` | string | 单标签过滤（旧版兼容） |
| `tagFilter` | string | 逗号分隔的包含标签（AND 逻辑） |
| `tagExclude` | string | 逗号分隔的排除标签 |
| `lang` | `zh\|en` | 语言代码 |

### 日期格式

所有日期字段使用 ISO 8601 格式：`2026-07-01T12:34:56.789Z`
