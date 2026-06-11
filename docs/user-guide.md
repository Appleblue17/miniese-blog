# 用户指南

> **面向开发者/用户**的测试参考文档，包含运行批量测试，重置服务器等操作方式或接口调用方式。

## 测试指南

```bash
# 运行所有测试
npm test

# 监听模式（开发时使用）
npm run test:watch

# 带覆盖率报告
npm run test:coverage
```

### 测试框架

- **测试运行器**：Vitest v4
- **断言库**：Vitest 内置（兼容 Jest API，`describe` / `it` / `expect`）
- **覆盖率**：c8 / v8 引擎（通过 `@vitest/coverage-v8`）
- **配置**：`vitest.config.ts`

### 如何手动验证渲染效果

如果需要手动查看渲染输出，可以使用以下方法：

创建 `scripts/manual-test.mjs`：

```javascript
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";

const html = await unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeKatex)
  .use(rehypeStringify)
  .process("# Hello\n\n$E=mc^2$");

console.log(String(html));
```

运行：
```bash
node scripts/manual-test.mjs
```

### 如何编写新的测试

1. **单元测试**：与源文件同目录，命名为 `*.test.ts`
2. **集成测试**：放在 `tests/integration/`
3. **测试模板**：

```typescript
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./renderer";

describe("功能分组", () => {
  it("描述具体行为", async () => {
    const html = await renderMarkdown("# Title", "markdown");
    expect(html).toContain("<h1>Title</h1>");
  });
});
```

## 清理数据库与文件系统

开发过程中经常需要清理测试数据，让系统回到干净状态。

### 清理方法

```bash
# 1. 清空数据库表
npx prisma db execute --stdin <<< "DELETE FROM \"Article\"; DELETE FROM \"WikiEntry\"; DELETE FROM \"AiTask\";"

# 2. 删除文件系统中的 Markdown 源文件
find content/articles -name "*.md" -delete
find content/wiki -name "*.md" -delete

# 3. 清空 Redis 队列（如有残留任务导致 Worker 出错）
docker compose exec redis redis-cli EVAL "return redis.call('DEL', unpack(redis.call('KEYS', ARGV[1])))" 0 "bull:*"
```

### 仅清空 AI 审查记录

如果只想清空审查记录（保留文章和草稿），不删除文章本身：

```bash
# 清空所有 AiTask 记录（审查/翻译/生成等）
npx prisma db execute --stdin <<< "DELETE FROM \"AiTask\";"

# 同时清空 Redis 中的残留任务
docker compose exec redis redis-cli EVAL \
  "return redis.call('DEL', unpack(redis.call('KEYS', ARGV[1])))" 0 "bull:*"
```

这会将系统重置到"没有任何审查历史"的状态，PublishForm 中的 AI 审查面板会显示"点击审查按钮发起审查"的初始状态。

### 仅重置单篇文章的审查状态

```bash
# 查看文章 ID
npx prisma db execute --stdin <<< "SELECT id, title FROM \"Article\" WHERE status = 'draft';"

# 删除该文章关联的所有 AiTask 记录
npx prisma db execute --stdin <<< "DELETE FROM \"AiTask\" WHERE \"articleId\" = '<ARTICLE_ID>';"
```

### 原理解释

| 存储层 | 说明 | 清理方式 |
|-------|------|---------|
| **PostgreSQL 数据库** | 存储文章元信息、词条、AI 任务记录等 | `DELETE FROM "Article"` / `DELETE FROM "WikiEntry"` / `DELETE FROM "AiTask"` |
| **文件系统** (`content/articles/`) | 存储实际的 .md 源文件 | `find ... -delete` |
| **Redis** | Bull 队列存储待处理的 AI 任务 | `docker compose exec redis redis-cli EVAL ...` |

两者是**独立**的——删文件不会清 DB，删 DB 不会删文件。如果只做其中一项，页面上看到的结果会和实际不符：

- **只删文件，不清 DB** → 仪表盘仍然显示文章列表，但点击编辑/查看时 404（文件已不存在）
- **只清 DB，不删文件** → 仪表盘显示为空，但文件仍占用磁盘空间

### FAQ

**Q: 仪表盘显示有文章，但文件系统里找不到对应的 .md 文件？**
A: DB 记录还在但文件被删了。先执行 `DELETE FROM "Article"` 清 DB，或者重新走上传流程重建文件。

**Q: 为什么我删了 content/ 下的文件，页面还能看到文章？**
A: 页面（仪表盘列表）从 DB 读取数据，不从文件系统。需要同时清理 DB。

**Q: 有没有一键重置的方法？**
A: 把两个命令一起执行即可：

```bash
npx prisma db execute --stdin <<< "DELETE FROM \"Article\"; DELETE FROM \"WikiEntry\";"
find content/articles -name "*.md" -delete
echo "数据库和文件已清空"
```

## 队列系统

> 阶段 4 引入的异步 AI 任务队列，基于 Bull（Redis）+ 独立 Worker 进程。

### 架构概览

```
API Route (Next.js) → addJob() → Bull Queue (Redis) → Worker (独立进程) → DB 更新
                                              ↓
                                   客户端轮询 /api/ai/status/[taskId]
```

### 启动 Worker

Worker 是一个独立 Node.js 进程（非 Next.js），需在终端中单独启动：

```bash
# 确保 PostgreSQL 和 Redis 已启动
docker compose up -d

# 启动 Worker
npm run worker
```

输出示例：
```
[Worker] ai-tasks worker started. Waiting for jobs...
```

### 支持的 AI 任务类型

| 类型 | 说明 | 路由端点 |
|------|------|---------|
| `review` | AI 文章审查 | `POST /api/ai/review` | ✅ 已完成 |
| `translate` | AI 翻译 | `POST /api/ai/translate` | 🔘 待实现 |
| `generate` | AI 词条生成 | `POST /api/ai/generate` | 🔘 待实现 |
| `scan` | AI 文章扫描 | `POST /api/ai/scan` | 🔘 待实现 |

> **当前状态**：`review` 类型已完整实现（基于 DeepSeek API，分段处理+进度更新）。其余类型为模拟 handler（2s 延迟 + 返回固定结果），将在后续阶段实现。

### API 使用示例

**提交审查任务：**
```bash
curl -X POST http://localhost:3000/api/ai/review \
  -H "Content-Type: application/json" \
  -d '{"articleId": "your-article-id"}'
```
响应：`{ "taskId": "uuid-string" }`

**轮询任务状态：**
```bash
curl http://localhost:3000/api/ai/status/uuid-string
```
响应：
```json
{
  "id": "uuid-string",
  "type": "review",
  "status": "pending",
  "input": { "articleId": "..." },
  "output": null,
  "error": null,
  "createdAt": "2026-06-11T...",
  "completedAt": null
}
```
可能的状态：`pending` → `processing` → `completed` / `failed`

### 清理 Redis 队列

如果 Worker 因残留任务报错（`An operation failed because it depends on one or more records that were required but not found`），需要清空 Redis 中的 Bull 队列数据：

```bash
docker compose exec redis redis-cli EVAL \
  "return redis.call('DEL', unpack(redis.call('KEYS', ARGV[1])))" 0 "bull:*"
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `REDIS_URL` | Redis 连接字符串 | `redis://localhost:6379` |

### 注意事项

1. **Worker 必须独立运行**，它不随 Next.js 一起启动
2. **Redis 必须可用**，否则队列操作会抛出错误
3. **测试会产生残留数据**，运行集成测试后建议清理 Redis（见上方清理命令）
4. 当前 Job 重试策略：最多 3 次，指数退避（初始 2s）

---

## AI 审查系统

> 阶段 5.2 实现的 AI 文章审查功能，基于 DeepSeek API。

### 工作流程

```
PublishForm → POST /api/ai/review → addJob() → Bull Queue → Worker
                                                         ↓
              前端轮询 GET /api/ai/status/[taskId] ← 进度更新
                                                         ↓
              审查完成 → 跳转详情页 /admin/reviews/[id]
```

审查是**异步**的：
1. **PublishForm** 中点击"发起 AI 审查" → 提交任务 → 返回 `taskId`
2. 前端开始**轮询** `/api/ai/status/[taskId]`（每 3 秒）
3. Worker 处理时写 `output.progress`（如 `{ totalChunks: 3, processedChunks: 1 }`）
4. 前端显示进度条 + "已处理 X/Y 个段落"
5. 完成后自动跳转到审查详情页

### 审查详情页

**列表页** `/admin/reviews`：分页显示所有审查任务，包含文章标题、状态（等待中/处理中/已完成/失败）、时间、问题数。

**详情页** `/admin/reviews/[reviewId]`：
- Header：状态徽章 + 创建/完成时间 + 下载源文件按钮
- 错误/处理中状态：失败原因或进度条
- Summary 卡片：问题总数 / 错误 / 警告 / 建议
- ReviewChunkList 组件：段落可折叠、四级 severity 筛选、section 分组、severity 色块计数
- 底部：原始 JSON 展开查看

### 审查 Prompt

审查输出分为四个 section：

| section | 说明 |
|---------|------|
| `factual` | 事实性错误 |
| `typo` | 拼写与语法 |
| `clarity` | 表达歧义与通顺性 |
| `other` | 其他建议 |

每个 item 的 severity 可选值：

| severity | 含义 |
|----------|------|
| `error` | 明确错误，必须修改 |
| `warning` | 可能有问题，建议关注 |
| `suggestion` | 非必要优化建议 |
| `ok` | 经检查后确认没问题 |

### 手动触发审查

```bash
# 获取文章 ID
npx prisma db execute --stdin <<< "SELECT id, title FROM \"Article\" WHERE status = 'draft' LIMIT 5;"

# 提交审查
curl -X POST http://localhost:3000/api/ai/review \
  -H "Content-Type: application/json" \
  -d '{"articleId": "<ARTICLE_ID>"}'
# 响应: {"taskId": "uuid-string"}

# 轮询状态
curl http://localhost:3000/api/ai/status/<TASK_ID>
```
