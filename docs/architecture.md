# 技术设计文档

> 本文档面向开发者和 AI Agent，描述系统的技术实现方案。需求细节请参考 `docs/PRD.md`。如需修改请明确提出并做好记录。

## 0、修改记录

**最后更新**：2026-06-10

### v0.4.0 2026-06-10

- 第 7.10 节：新增 buildFrontmatter 工具函数——将 UI 元信息写入文件 frontmatter，保留额外字段
- 第 3.1 节：更新上传/发布流程——API 接收 UI 元信息，写文件前调用 buildFrontmatter
- 第 11 节：更新发布流程 API 参数

### v0.3.0 2026-06-10

- 第 4.1 节：Article 模型新增 `draftOfId` 自引用字段，建立草稿-已发布文章绑定关系
- 第 4.1 节：新增 `DraftRelation` 自关联，支持草稿查询
- 第 10 节：重写开发顺序，新增发布流程三步骤拆分
- 第 11.4 节：仪表盘路由新增草稿编辑和审查路由

### v0.2.1 2026-06-10

- 第 4.1 节：Article 模型新增 `contentType` 字段、`viewCount` 字段、`likes` 字段
- 第 4.1 节：新增 `ContentFormat` enum（markdown / notesaw），用于选择渲染管线

### v0.2.0 2026-06-09

- 第 7 章：重写 Markdown 渲染设计，新增 Notesaw 语法说明、双渲染管线、集成实现细节
- 新增第 7.4 节：Notesaw 语法详解（block / inline-block / box 语法、标签缩写、CSS 样式策略）
- 新增第 7.5 节：Notesaw 渲染管线内部实现（Parser 架构、AST 节点类型、Transformer 转换）
- 更新第 7.1 节：渲染流程改为双管线设计（标准 Markdown / Notesaw）
- 新增第 7.6 节：内容类型判断策略
- 新增第 7.7 节：CSS 与图标资源管理

---

## 1. 总体架构

系统采用 Next.js 全栈架构，附加独立的队列 Worker 处理长时间 AI 任务。

### 1.1 组成部分

| 组件 | 职责 | 运行方式 |
|------|------|----------|
| Next.js 应用 | 页面渲染 + API Routes（短任务） | 主进程 |
| Redis | 队列存储（Bull） | 独立容器 |
| Worker | 消费队列中的长任务（AI 审查、翻译、词条生成） | 独立进程 |
| PostgreSQL | 数据存储 | 独立容器 |

### 1.2 通信流程

- 用户请求 → Next.js API Route → 创建任务存入 Redis 队列 → 立即返回任务 ID
- Worker 从队列取任务 → 调用 DeepSeek API → 更新数据库中的任务结果
- 前端轮询任务状态 API → 获取结果后展示

### 1.3 短任务 vs 长任务

| 类型 | 直接处理 | 走队列 |
|------|----------|--------|
| 文章发布（不含审查） | ✅ | |
| 读取文章列表 | ✅ | |
| 读者对话 | ✅ | |
| 发送邮件 | ✅ | |
| AI 审查 | | ✅ |
| AI 翻译 | | ✅ |
| AI 词条生成 | | ✅ |
| 扫描旧文章 | | ✅ |

---

## 2. 技术栈详情

### 2.1 核心框架

| 项目 | 技术 | 版本 |
|------|------|------|
| 前端/后端 | Next.js | 最新稳定版 |
| 样式 | Tailwind CSS | 最新 |
| UI 组件 | shadcn/ui | 最新 |
| 语言 | TypeScript | 最新 |

### 2.2 数据库

| 项目 | 技术 | 说明 |
|------|------|------|
| 数据库 | PostgreSQL | 使用 Docker 运行 |
| ORM | Prisma | 提供类型安全的数据库操作 |
| 连接池 | Prisma 内置 | |

### 2.3 队列系统

| 项目 | 技术 | 说明 |
|------|------|------|
| 队列库 | Bull | 基于 Redis 的任务队列 |
| Redis | Redis 7+ | Docker 运行 |
| Worker | 独立 Node.js 进程 | 使用 `bull` 的 Worker |

### 2.4 AI 集成

| 项目 | 技术 | 说明 |
|------|------|------|
| API 调用 | 原生 fetch | 调用 DeepSeek API |
| 提示词管理 | 模板字符串 + 配置文件 | 存储在 `config/prompts/` |
| 响应解析 | JSON.parse + 容错 | AI 返回结构化 JSON |

### 2.5 其他服务

| 项目 | 技术 | 说明 |
|------|------|------|
| 邮件 | Resend SDK | 通知发送 |
| 认证 | NextAuth.js | MVP 暂不实现，预留 |
| 文件存储 | 本地文件系统 | `content/` 目录 |

---

## 3. 项目目录结构

```
miniese-blog/
├── docker-compose.yml          # 开发环境编排（PostgreSQL + Redis）
├── Dockerfile                  # 生产环境镜像
├── .env.example                # 环境变量模板
├── package.json
├── prisma/
│   ├── schema.prisma           # 数据库 schema
│   └── migrations/             # 迁移文件
├── public/                     # 静态资源
├── content/                    # Markdown 源文件（Git 管理）
│   ├── articles/
│   │   ├── zh/
│   │   ├── en/
│   │   └── drafts/
│   └── wiki/
│       ├── zh/
│       └── en/
├── src/
│   ├── app/
│   │   ├── (public)/           # 公开页面
│   │   │   ├── page.tsx        # 主页
│   │   │   ├── articles/
│   │   │   ├── wiki/
│   │   │   └── about/
│   │   ├── (dashboard)/        # 仪表盘（需认证，MVP 简单密码保护）
│   │   │   └── admin/
│   │   ├── api/                # API Routes
│   │   │   ├── articles/
│   │   │   ├── wiki/
│   │   │   ├── ai/
│   │   │   │   ├── review/     # 提交审查任务
│   │   │   │   ├── translate/  # 提交翻译任务
│   │   │   │   ├── generate/   # 提交词条生成任务
│   │   │   │   └── status/     # 查询任务状态
│   │   │   └── webhook/        # 预留
│   │   └── layout.tsx
│   ├── components/             # React 组件
│   │   ├── ui/                 # shadcn/ui 组件
│   │   ├── layout/             # 导航栏、页脚等
│   │   ├── article/            # 文章相关组件
│   │   ├── wiki/               # 词条相关组件
│   │   └── ai/                 # AI 对话窗口等
│   ├── lib/
│   │   ├── db.ts               # Prisma 客户端（全局单例）
│   │   ├── queue/              # 队列相关
│   │   │   ├── client.ts       # 队列初始化
│   │   │   ├── producer.ts     # 创建任务
│   │   │   ├── consumer.ts     # Worker 消费逻辑
│   │   │   └── jobs/           # 各类型任务的处理函数
│   │   ├── ai/
│   │   │   ├── client.ts       # DeepSeek API 封装
│   │   │   ├── prompts/        # 提示词模板
│   │   │   └── parsers.ts      # 响应解析
│   │   ├── markdown/
│   │   │   ├── renderer.ts     # Notesaw/Remark 渲染
│   │   │   └── linkDetector.ts # 词条链接检测
│   │   └── mail.ts             # Resend 封装
│   ├── types/                  # TypeScript 类型
│   │   ├── article.ts
│   │   ├── wiki.ts
│   │   └── ai.ts
│   └── worker.ts               # Worker 入口文件
├── tailwind.config.js
├── next.config.js
└── tsconfig.json
```

---

## 4. 数据库设计

### 4.1 核心表结构

#### Article（文章）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (UUID) | 主键 |
| slug | String | URL 标识，与语言组合唯一 |
| title | String | 标题 |
| language | Enum (zh, en) | 语言 |
| contentType | Enum (markdown, notesaw) | 内容格式，决定渲染管线（v0.2.1 新增） |
| contentPath | String | MD 文件路径 |
| summary | Text? | AI 生成的摘要 |
| tags | String[] | 标签数组 |
| status | Enum (draft, published, review) | 状态 |
| accessGroup | String[] | 要求权限组，默认空（表示公开） |
| publishedAt | DateTime? | 发布时间 |
| updatedAt | DateTime | 更新时间 |
| changelog | Text? | 最近的变更摘要 |
| author | String | 作者（默认"博主"） |
| viewCount | Int | 阅读量，默认 0（v0.2.1 新增） |
| likes | Int | 点赞数，默认 0（v0.2.1 新增） |
| draftOfId | String? | 草稿关联的已发布文章 ID（v0.3.0 新增） |

##### 自关联说明

Article 表通过 `draftOfId` 实现自关联，用于草稿-已发布文章绑定：

- `draftOfId = null` 且 `status = published`：已发布文章
- `draftOfId = null` 且 `status = draft`：新文章草稿（从未发布过）
- `draftOfId = <文章ID>` 且 `status = draft/review`：编辑已有文章的草稿

约束：
- 每篇已发布文章至多一条草稿引用它（应用层保证）
- `@@unique([slug, language])` 仅对已发布文章生效；草稿的 slug 可重复（最终发布时校验）

#### WikiEntry（词条）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (UUID) | 主键 |
| name | String | 主名称 |
| aliases | String[] | 别名列表 |
| language | Enum (zh, en) | 语言 |
| definition | Text | 定义型内容（hover 预览） |
| contentPath | String | 完整词条 MD 文件路径 |
| tags | String[] | 标签 |
| accessGroup | String[] | 权限组 |
| isAIGenerated | Boolean | 是否 AI 生成 |
| isReviewed | Boolean | 是否经人工审查 |
| createdAt | DateTime | |
| updatedAt | DateTime | |

#### ArticleWikiLink（文章-词条关联）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (UUID) | |
| articleId | String | 关联文章 |
| wikiEntryId | String | 关联词条 |
| detectedAt | DateTime | 自动检测时间 |

#### AiTask（AI 任务队列）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (UUID) | 任务 ID，返回给前端 |
| type | Enum (review, translate, generate, scan) | 任务类型 |
| status | Enum (pending, processing, completed, failed) | 状态 |
| input | Json | 任务参数（如文章 ID） |
| output | Json? | 任务结果（如审查报告） |
| error | Text? | 错误信息 |
| createdAt | DateTime | |
| completedAt | DateTime? | |

#### Comment（评论）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (UUID) | |
| articleId | String | 所属文章 |
| authorName | String | 评论者名称（邮箱留待后续） |
| content | Text | 评论内容 |
| isHidden | Boolean | 是否被 AI 初审隐藏 |
| createdAt | DateTime | |

### 4.2 关系说明

- Article 自关联（draftOfId）：草稿 → 已发布文章，一对多（应用层约束为一对一）
- Article ↔ WikiEntry：多对多，通过 ArticleWikiLink 关联
- Article ↔ Comment：一对多

---

## 5. 队列设计

### 5.1 任务类型

| 类型 | 输入 | 输出 |
|------|------|------|
| review | articleId, 文章内容 | 审查报告（结构化 JSON） |
| translate | articleId, 源语言, 目标语言 | 译文 Markdown 文件路径 |
| generate | wikiEntryProposalId | 中英文词条内容 |
| scan | （可选）文章范围 | 新词条提议列表 |

### 5.2 任务生命周期

1. API 调用 `producer.add(jobType, data)` → 返回 `job.id`
2. Worker 处理：更新数据库状态为 `processing` → 调用 AI → 更新结果
3. 前端轮询 `/api/ai/status?id=xxx` → 拿到结果后展示

### 5.3 Worker 实现要点

- 单独进程，`node dist/worker.js`
- 监听 `completed` 和 `failed` 事件，更新数据库
- 失败重试机制（最多 3 次）

---

## 6. AI 集成设计

### 6.1 DeepSeek API 调用封装

```typescript
// lib/ai/client.ts
async function callDeepSeek(prompt: string, responseFormat?: "json"): Promise<string>
```

- 统一错误处理（重试、超时）
- 支持 JSON 模式（要求 AI 返回合法 JSON）
- 记录每次调用的 token 消耗（用于监控）

### 6.2 提示词管理

- 存储在 `lib/ai/prompts/` 目录下，每个功能一个 `.txt` 或 `.ts` 文件
- 支持变量插值（如 `{{articleContent}}`）
- 博主可在仪表盘修改（未来功能）

### 6.3 审查报告格式

AI 返回的 JSON 结构：

```typescript
interface ReviewReport {
  sections: {
    type: "factual" | "typo" | "structure" | "other";
    title: string;
    items: {
      severity: "error" | "warning" | "suggestion";
      lineStart: number;
      lineEnd: number;
      snippet: string;
      issue: string;
      suggestion: string;
    }[];
  }[];
}
```

---

## 7. Markdown 渲染设计

### 7.1 双渲染管线

系统支持两种内容格式，根据 `contentType` 字段选择渲染管线：

| 管线 | 适用格式 | 特点 |
|------|----------|------|
| 标准 Markdown | 普通 `.md` 文件 | 使用 standard remark/rehype 管道 |
| Notesaw | Notesaw 格式的 `.md` 文件 | 使用自定义 parser + block 转换插件 |

选择策略：Article 和 WikiEntry 模型的 `contentType` 字段（`"markdown"` | `"notesaw"`）决定使用哪条管线。若未指定，默认走标准 Markdown。

### 7.2 渲染器入口

统一渲染函数位于 `src/lib/markdown/renderer.ts`：

```typescript
export async function renderMarkdown(
  content: string,
  contentType: "markdown" | "notesaw"
): Promise<string>
```

- 输出 HTML **片段**（无 `<html><head><body>` 包装），通过 React 的 `dangerouslySetInnerHTML` 注入页面
- 空字符串或纯空白输入返回空字符串

### 7.3 标准 Markdown 渲染管线

```
MD 文件内容
  → remark-parse (GFM + math)
  → remark-rehype
  → rehype-katex (KaTeX 公式)
  → rehype-stringify
  → HTML 片段
```

依赖：
- `remark-parse`, `remark-gfm`, `remark-math` — Markdown 解析
- `remark-rehype` — MDAST→HAST 转换
- `rehype-katex` — KaTeX 数学公式渲染
- `rehype-stringify` — HAST→HTML 序列化

### 7.4 Notesaw 渲染管线

```
Notesaw 文件内容
  → noteParsePlugin (自定义 parser，识别 @block / @inline-block)
  → noteBoxParsePlugin (处理 @[...] box 语法 + math wrapper)
  → remark-rehype (MDAST → HAST)
  → rehype-katex (KaTeX 数学渲染)
  → noteTransformPlugin (block → 带样式/图标/颜色的 HTML 结构)
  → rehype-stringify
  → HTML 片段
```

> **说明**：Notesaw 自定义 parser (`noteParsePlugin`) 作为 unified 插件替换默认的 `remark-parse`。它线性扫描文档，将 block/inline-block 语法解析为 MDAST 节点，其余部分交由 remark-parse 分段处理。最终产出一个混合 MDAST。

### 7.5 Notesaw 语法详解

Notesaw 是 Markdown 的超集，向下兼容所有 GFM 语法。

#### 7.5.1 Block 块语法

```
'+'? '@' label [?!*]? (' '+ title ' '*)? '{'
    (缩进 4 空格的内容)
'}'

- label: [a-z]+，支持缩写映射
- title: 可选，渲染为块标题行
- 内容必须缩进 4 空格或 1 Tab
```

标签缩写映射（定义在 `parser.ts` 的 `abbrMap` 中）：

| 缩写 | 全称 | 用途 |
|------|------|------|
| thm | theorem | 定理 |
| prop | proposition | 命题 |
| cor | corollary | 推论 |
| def | definition | 定义 |
| warn | warning | 警告 |
| vars / var | variables | 变量说明 |
| alg | algorithm | 算法 |
| prob | problem | 问题 |
| sol | solution | 解答 |
| ref | reference | 参考 |

示例：
```
@theorem 勾股定理 {
    直角三角形两条直角边的平方和等于斜边的平方。

    @proof {
        略。
    }
}
```

#### 7.5.2 Inline Block 内联块语法

```
'+'? '@' label [?!*]? ' ' content '\n'
```

- 单行语法，不能换行
- 不支持 title
- 渲染为带左边框色条、图标的行内容器

示例：
```
@note 注意缩进必须使用 4 个空格。
```

#### 7.5.3 Box 语法

```
@[content]
```

- 行内容器，不可嵌套
- 用于强调关键词、行内定义、简短公式

示例：
```
@[勾股定理]是几何学中最重要的定理之一。
@[$a^2 + b^2 = c^2$]
```

### 7.6 Notesaw 渲染管线内部实现

#### 7.6.1 Parser 架构 (`parser.ts`)

核心解析函数 `parseNote(text: string): NoteNode`：

1. **预处理**：将 Tab 展开为 4 空格，建立行列索引数组
2. **块解析**：使用 `indentLevel` 栈逐字符扫描，识别：
   - `parseBlockBegin()` — 匹配 `@label[?!*] title {`
   - `parseInlineBlock()` — 匹配 `@label[?!*] content\n`
3. **标记切割**：识别到 `}` 关闭符时，弹出块栈，将内容交由 `parseNativeMarkdown()` 用标准 remark 解析
4. **合并**：Notesaw 块节点和标准 Markdown MDAST 节点合并为一个完整 MDAST

`parseNativeMarkdown(str, trailSpaces, offset)`：
- 用 `remark-parse + remark-gfm + remark-math` 解析文本
- 修正位置偏移（trim 前导空格）
- 标记为 `type: "markdown"` 节点

#### 7.6.2 AST 节点类型

| `type` | 说明 | data.hName | data.hProperties.class |
|--------|------|-----------|----------------------|
| `root` | 文档根节点 | div | markdown-body |
| `block` | 块容器 | div | {label}-block-mdast |
| `inline-block` | 内联块 | div | {label}-inline-block-mdast |
| `markdown` | 标准 Markdown 片段 | 由 remark 决定 | — |
| `math-wrapper` | KaTeX 数学公式包装 | div | — |

#### 7.6.3 Transformer 转换 (`transformer.ts`)

`noteTransformPlugin()` 是一个 rehype 插件，在 HAST 层面做最终样式化：

1. **查找块节点**：遍历 HAST，匹配 className 中 `-block-mdast` / `-inline-block-mdast` / `box`
2. **颜色生成**：`hashString(label)` → `hsl(hash % 360, 80%, 70%)` 生成唯一颜色
3. **结构重构**：
   - Block：`<div class="block-container">` → `<div class="block-title">`（图标 + label + 标题）+ `<div class="block-body">`（内容）
   - Inline Block：`<div class="inline-block-container">` → 图标 + label + 内容
   - Box：转化为 `<span class="box">`
4. **图标注入**：根据 label 从 `iconMap` 查找对应 Feather 图标名称，生成 `<svg><use href="#icon-name"/>`

> **精简说明**：与原版 Notesaw 相比，此版本移除了所有 VS Code 扩展专用逻辑（行号映射、partial rendering、光标同步、全局 counter/map 数组等），仅保留纯转换功能。

### 7.7 词条链接检测

- 渲染前扫描 MD 内容，匹配 WikiEntry 的主名称和别名
- 将匹配的文本替换为 `<a href="/wiki/{slug}">` 标签
- hover 数据（definition 字段）通过 `data-wiki` 属性存储，前端 JS 处理预览弹出
- 链接检测应在渲染**之前**执行，替换文本后再送入渲染管线

### 7.8 CSS 与图标资源管理

Notesaw 渲染需要以下样式和资源：

| 资源 | 来源 | 说明 |
|------|------|------|
| `note.css` | Notesaw 项目的样式文件 | Notesaw block 样式（容器、标题、body 布局） |
| `katex.min.css` | KaTeX 包 | 数学公式样式 |
| Feather SVG sprite | 图标 SVG 集合 | 所有 block 图标的 SVG 集合 |

**Next.js 集成策略**：
- 将 `note.css` 复制到 `public/` 目录，在全局布局中引用
- Feather 图标：将 SVG sprite 嵌入到布局组件（`<div style="display:none">`），供所有 Notesaw 渲染内容引用
- KaTeX CSS：从 `node_modules/katex/dist/katex.min.css` 引入

### 7.9 渲染时机

- **发布时渲染**：文章发布时调用渲染管线，生成 HTML 片段存入数据库 `renderedContent` 字段或缓存文件
- 理由：文章更新频率低，避免每次请求都执行 unified 解析（解析成本较高）
- 前台显示时直接使用预渲染的 HTML（通过 `dangerouslySetInnerHTML` 注入）
- 仪表盘中编辑预览时按需实时渲染

### 7.10 Notesaw 源代码位置

Notesaw 的核心源码位于 `packages/notesaw/`：

```
packages/notesaw/
├── package.json          # 包定义
├── index.ts              # NoteNode 类型定义
├── parser.ts             # 核心解析器 (noteParsePlugin, noteBoxParsePlugin)
├── transformer.ts        # HAST 转换器 (noteTransformPlugin，精简版)
├── lib/type-declare.d.ts
└── utils/prettyprint.ts  # AST 调试工具
```

`renderer.ts` 通过相对路径引用：
```typescript
import noteParsePlugin, { noteBoxParsePlugin } from "../../../packages/notesaw/parser.ts";
import { noteTransformPlugin } from "../../../packages/notesaw/transformer.ts";
```

---

## 8. 部署方案

### 8.1 开发环境（Docker Compose）

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: miniese
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: devpass
    ports:
      - "5432:5432"

  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

Next.js 和 Worker 在本地运行（非容器），方便调试。

### 8.2 生产环境

在云服务器上：
- 使用 Docker Compose 编排所有服务（PostgreSQL、Redis、Next.js、Worker）
- 或使用 PM2 管理 Next.js + Worker，数据库用独立容器

---

## 9. 环境变量清单

```env
# 数据库
DATABASE_URL="postgresql://..."

# Redis
REDIS_URL="redis://localhost:6379"

# DeepSeek
DEEPSEEK_API_KEY="sk-..."
DEEPSEEK_BASE_URL="https://api.deepseek.com"

# Resend（可选，MVP 可先不配置）
RESEND_API_KEY="..."

# 认证（MVP 简单密码保护）
ADMIN_PASSWORD="your-secure-password"

# 站点配置
SITE_NAME="Miniese's Blog"
SITE_URL="https://..."
```

---

## 10. 开发顺序（概要）

| 阶段 | 模块 | 依赖 |
|------|------|------|
| 1 | 基础环境（Docker Compose、Prisma、Next.js 启动） | 无 |
| 2 | 文件存储 + Markdown 渲染 | 无 |
| 3 | 文章 CRUD 基础（发布、列表、阅读页） | 阶段 2 |
| 3a | 发布流程步骤一：上传页（上传+预览+元信息+存草稿/审查/发布入口） | 阶段 3 |
| 3b | 发布流程步骤二：草稿页（编辑元信息+审查状态展示） | 阶段 3a |
| 3c | 发布流程步骤三：确认页（diff+changelog+确认发布） | 阶段 3b |
| 4 | 知识库 CRUD（手动词条、链接检测、hover） | 阶段 2 |
| 5 | 队列基础设施（Bull、Worker 框架） | Redis |
| 6 | AI 审查功能（队列任务 + 前端集成） | 阶段 3、5 |
| 7 | AI 翻译功能 | 阶段 3、5 |
| 8 | AI 词条发现与生成 | 阶段 4、5 |
| 9 | 仪表盘前端（所有管理界面） | 阶段 3-8 |
| 10 | 读者对话窗口 | 阶段 3 |
| 11 | 评论功能 | 阶段 3 |

---

## 11. 路由规划

> 本文档定义博客系统的所有路由。语言前缀贯穿所有公开页面，API 和仪表盘路由不受影响。

### 11.1 核心设计原则

1. **语言前缀**：所有公开页面使用 `/{lang}/` 前缀，`lang` 取值为 `zh`（中文）或 `en`（英文）
2. **默认重定向**：访问 `/` 自动重定向到用户偏好的语言版本
3. **API 不受影响**：`/api/*` 路由无语言前缀
4. **仪表盘不受影响**：`/admin/*` 路由无语言前缀（仅博主访问）

### 11.2 公开路由（带语言前缀）

| 路径 | 页面 | 说明 |
|------|------|------|
| `/{lang}` | 主页 | 语言版本的主页 |
| `/{lang}/articles` | 文章列表页 | 指定语言的已发布文章 |
| `/{lang}/articles/[slug]` | 文章阅读页 | slug 不包含语言，由路径前缀区分 |
| `/{lang}/wiki` | 词条列表页 | 指定语言的词条 |
| `/{lang}/wiki/[name]` | 词条阅读页 | 词条名不包含语言 |
| `/{lang}/about` | 关于页 | 语言版本的关于页面 |
| `/{lang}/settings` | 读者设置页 | 偏好设置、认证等 |

**示例**：
- `/zh/articles/hello-world` - 中文版文章
- `/en/articles/hello-world` - 英文版文章（相同 slug）

### 11.3 无语言前缀的路由

| 路径 | 说明 |
|------|------|
| `/` | 自动重定向到 `/{lang}` |
| `/rss.xml` | RSS Feed（可按语言分离，MVP 先做默认语言） |
| `/sitemap.xml` | 站点地图 |
| `/api/*` | 所有 API 路由 |
| `/admin/*` | 仪表盘路由（HTTP Basic Auth 保护） |

### 11.4 仪表盘路由（博主专用）

| 路径 | 功能 |
|------|------|
| `/admin` | 仪表盘首页 |
| `/admin/articles` | 文章管理（已发布+草稿绑定显示） |
| `/admin/articles/new` | 发布文章（步骤一：上传页） |
| `/admin/articles/[id]/edit` | 编辑草稿（步骤二：草稿页） |
| `/admin/articles/[id]/confirm` | 发布确认（步骤三：确认页） |
| `/admin/wiki` | 词条管理 |
| `/admin/wiki/proposals` | 词条提议审批 |
| `/admin/reviews` | 审查报告 |
| `/admin/notifications` | 通知中心 |
| `/admin/settings` | 站点设置 |

### 11.5 API 路由

#### 文章相关

| 方法 | 路径 | 说明 | 语言参数 |
|------|------|------|----------|
| POST | `/api/articles/upload` | 上传 MD 文件到草稿 | 从 frontmatter 读 |
| POST | `/api/articles/preview` | 预览渲染 | 无需 |
| POST | `/api/articles/publish` | 发布文章 | 从 frontmatter 读 |
| GET | `/api/articles` | 文章列表 | `?lang=zh` 必填 |
| GET | `/api/articles/[slug]` | 文章详情 | `?lang=zh` 必填 |
| PUT | `/api/articles/[slug]` | 更新文章（v2） | `?lang=zh` |
| DELETE | `/api/articles/[slug]` | 删除文章（v2） | `?lang=zh` |

#### 词条相关

| 方法 | 路径 | 说明 | 语言参数 |
|------|------|------|----------|
| GET | `/api/wiki` | 词条列表 | `?lang=zh` 必填 |
| GET | `/api/wiki/[name]` | 词条详情 | `?lang=zh` 必填 |
| POST | `/api/wiki` | 创建词条 | 从请求体读 |
| PUT | `/api/wiki/[name]` | 更新词条 | `?lang=zh` |
| DELETE | `/api/wiki/[name]` | 删除词条 | `?lang=zh` |
| POST | `/api/wiki/proposals` | 提交词条申请 | 无需 |
| POST | `/api/wiki/proposals/[id]/approve` | 审批提议 | 无需 |

#### AI 相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/review` | 提交审查任务 |
| POST | `/api/ai/translate` | 提交翻译任务 |
| POST | `/api/ai/generate` | 提交词条生成任务 |
| GET | `/api/ai/status/[taskId]` | 查询任务状态 |
| POST | `/api/chat` | 读者对话 |

#### 评论相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/comments?articleId=xxx` | 获取评论列表 |
| POST | `/api/comments` | 发表评论 |
| PUT | `/api/comments/[id]/hide` | 隐藏/显示评论（博主） |

### 11.6 Proxy 实现

语言重定向和校验通过 `proxy.ts`（Next.js 16 文件约定，取代废弃的 `middleware.ts`）实现：

```typescript
// proxy.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SUPPORTED_LANGUAGES = ['zh', 'en']
const DEFAULT_LANGUAGE = 'zh'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // API、仪表盘、静态资源不处理
  if (pathname.startsWith('/api') || 
      pathname.startsWith('/admin') ||
      pathname.startsWith('/_next') ||
      pathname.startsWith('/favicon.ico') ||
      pathname === '/rss.xml' ||
      pathname === '/sitemap.xml') {
    return NextResponse.next()
  }
  
  // 检查是否已有语言前缀
  const firstSegment = pathname.split('/')[1]
  if (SUPPORTED_LANGUAGES.includes(firstSegment)) {
    return NextResponse.next()
  }
  
  // 获取用户偏好的语言
  let preferredLang = request.cookies.get('preferred_lang')?.value
  if (!preferredLang) {
    const acceptLang = request.headers.get('accept-language') || ''
    preferredLang = acceptLang.startsWith('zh') ? 'zh' : 'en'
  }
  if (!SUPPORTED_LANGUAGES.includes(preferredLang)) {
    preferredLang = DEFAULT_LANGUAGE
  }
  
  // 重定向
  const newUrl = new URL(`/${preferredLang}${pathname}`, request.url)
  return NextResponse.redirect(newUrl)
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
}
```

### 11.7 语言切换逻辑

- 切换按钮位于导航栏右上角
- 点击后：
  1. 保存 `preferred_lang` 到 cookie（有效期 1 年）
  2. 将当前路径中的语言部分替换为目标语言
  3. 跳转到新路径
- 如果目标语言版本的内容不存在，显示 404 页面

**示例**：用户在 `/zh/articles/hello-world` 点击切换到英文
→ 跳转到 `/en/articles/hello-world`

### 11.8 前端页面实现顺序（调整后）

| 顺序 | 页面 | 说明 |
|------|------|------|
| 1 | `/admin/articles/new` | 发布页（无语言依赖） |
| 2 | `/{lang}/articles` | 文章列表页（需要 lang 参数） |
| 3 | `/{lang}/articles/[slug]` | 文章阅读页（需要 lang 参数） |
| 4 | `/admin/articles` | 文章管理页 |
| 5 | `/{lang}/wiki` | 词条列表页（后续阶段） |
| 6 | `/{lang}/wiki/[name]` | 词条阅读页（后续阶段） |

### 11.9 对已实现 API 的影响

阶段2.2 已实现的 API 需要小幅调整：

| API | 当前状态 | 需要的调整 |
|-----|----------|------------|
| `GET /api/articles` | 无语言参数 | 增加 `lang` 必填查询参数 |
| `GET /api/articles/[slug]` | 无语言参数 | 增加 `lang` 必填查询参数 |
| `POST /api/articles/publish` | 从 frontmatter 读取 `lang` | ✅ 无需调整 |
| 文件路径 | `content/articles/{lang}/{slug}.md` | ✅ 已实现 |

**调整示例**：
```typescript
// 调用时
fetch(`/api/articles?lang=${lang}&page=1`)
fetch(`/api/articles/${slug}?lang=${lang}`)
```

---

## 12. 后续扩展预留

- **向量数据库**：将 `AiTask` 中的输出改为可存储 embedding
- **Git 集成**：在发布流程中增加 `git commit` 调用
- **定时任务**：用 `node-cron` 在 Worker 中增加定期扫描逻辑