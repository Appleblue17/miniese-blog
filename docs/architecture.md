# 技术设计文档

> 本文档面向开发者和 AI Agent，描述系统的技术实现方案。需求细节请参考 `docs/PRD.md`。如需修改请明确提出并做好记录。

## 0、修改记录

**最后更新**：2026-06-09

### [版本] [修改时间]

[分点列出修改内容概要]

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
| contentPath | String | MD 文件路径 |
| summary | Text? | AI 生成的摘要 |
| tags | String[] | 标签数组 |
| status | Enum (draft, published) | 状态 |
| accessGroup | String[] | 要求权限组，默认空（表示公开） |
| publishedAt | DateTime? | 发布时间 |
| updatedAt | DateTime | 更新时间 |
| changelog | Text? | 最近的变更摘要 |
| author | String | 作者（默认"博主"） |

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

### 7.1 渲染流程

1. 读取 MD 文件
2. 使用 unified 生态（remark/rehype）解析
3. 集成 Notesaw 插件（处理 block 语法）
4. 集成 remark-math（KaTeX）
5. 输出 HTML

### 7.2 词条链接检测

- 渲染前扫描 MD 内容，匹配词条主名称和别名
- 将匹配的文本替换为 `<a href="/wiki/...">` 标签
- hover 数据（定义型内容）通过 `data-wiki` 属性存储，前端 JS 处理预览

### 7.3 渲染时机

- **发布时渲染**：生成 HTML 存入数据库或缓存文件
- 理由：文章更新频率低，避免每次请求解析

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
| 3 | 文章 CRUD（发布、列表、阅读页） | 阶段 2 |
| 4 | 知识库 CRUD（手动词条、链接检测、hover） | 阶段 2 |
| 5 | 队列基础设施（Bull、Worker 框架） | Redis |
| 6 | AI 审查功能（队列任务 + 前端集成） | 阶段 3、5 |
| 7 | AI 翻译功能 | 阶段 3、5 |
| 8 | AI 词条发现与生成 | 阶段 4、5 |
| 9 | 仪表盘前端（所有管理界面） | 阶段 3-8 |
| 10 | 读者对话窗口 | 阶段 3 |
| 11 | 评论功能 | 阶段 3 |

---

## 11. 后续扩展预留

- **向量数据库**：将 `AiTask` 中的输出改为可存储 embedding
- **Git 集成**：在发布流程中增加 `git commit` 调用
- **定时任务**：用 `node-cron` 在 Worker 中增加定期扫描逻辑