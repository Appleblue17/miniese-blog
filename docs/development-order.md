# 开发顺序 v1.0

> 本文档定义模块的开发顺序，以及每个模块的验收标准。Agent 应按顺序逐模块实现。如需修改请明确提出并做好记录。

## 0、修改记录

**最后更新**：2026-06-11

### v1.2.0 2026-06-11

- 阶段 3.5：知识库管理界面新增状态切换栏（全部/申请中/生成中/待审查/已审查）+ 分页导航
- 阶段 3.5：新增手动"完成"按钮（creating → unreviewed），对应新端点 `POST /api/wiki/[name]/complete`
- 阶段 3.4：词条列表默认展示 `unreviewed` + `reviewed` 状态（AI 填充完成后即可上线，无需等待人工审查）

### v1.1.0 2026-06-11

- 阶段 3：全面重写知识库设计——新增词条状态机（proposed/creating/unreviewed/reviewed）、文件存储增加 frontmatter
- 模块 3.1：API 设计改为基于状态——POST 只接收 name+language，新增审批/审查端点
- 模块 3.5：仪表盘改为按状态分组展示
- 模块 3.2/3.3：推迟到后续阶段（依赖 AI 填充完成的词条）

---

## 阶段1：基础环境搭建

**目标**：项目能跑起来，数据库连接正常，基础配置完成。

| 任务 | 验收标准 |
|------|----------|
| 1.1 初始化 Next.js + TypeScript 项目 | `npm run dev` 能启动，访问 `http://localhost:3000` 看到欢迎页 |
| 1.2 配置 Tailwind CSS + shadcn/ui | 页面能使用 Tailwind 类名，能导入 shadcn 按钮组件 |
| 1.3 配置 Prisma + PostgreSQL（Docker） | `docker-compose up` 启动数据库，`npx prisma migrate dev` 成功 |
| 1.4 配置 Redis（Docker） | `docker-compose up` 启动 Redis，`redis-cli ping` 返回 PONG |
| 1.5 创建目录结构 | 按技术设计文档创建所有目录，`content/` 下有示例 MD 文件 |
| 1.6 配置环境变量模板 | `.env.example` 包含所有必需变量 |

**交付物**：能启动的开发环境 + 目录结构 + 示例文件

---

## 阶段2：内容核心（文章）

**目标**：能发布和阅读文章，这是博客的基础。

### 模块 2.1：Markdown 渲染器

| 任务 | 验收标准 |
|------|----------|
| 集成 Notesaw + Remark | 能解析示例 MD 文件，输出 HTML |
| 集成 KaTeX | 公式能正确渲染 |
| 渲染性能测试 | 含 100+ 公式的长文章在 1 秒内完成渲染 |

**交付物**：`lib/markdown/renderer.ts` + 单元测试

### 模块 2.2：文章基础 CRUD

| 任务 | 验收标准 |
|------|----------|
| 上传 MD 文件 API | `POST /api/articles/upload` 保存文件到 `content/articles/drafts/` |
| 预览 API | `POST /api/articles/preview` 返回渲染后的 HTML |
| 发布 API | `POST /api/articles/publish` 将草稿移到 `content/articles/{lang}/`，写入数据库 |
| 文章列表 API | `GET /api/articles` 支持分页、标签筛选 |
| 文章详情 API | `GET /api/articles/{slug}` 返回文章数据和 HTML |

**交付物**：5 个 API 端点 + 集成测试

### 模块 2.3：前端文章页面

| 任务 | 验收标准 |
|------|----------|
| 文章列表页 | `/{lang}/articles` 展示所有已发布文章，每篇文章为圆角卡片，显示标题、元数据行（作者/日期/阅读量/预计阅读时间/点赞数）、标签、语言标识（小label）、摘要；支持翻页和标签筛选；默认一列布局 |
| 文章阅读页 | `/{lang}/articles/{slug}` 展示正文（dangerouslySetInnerHTML）+ 文章顶部元数据栏 + 右侧目录导航（滚动高亮），文末版权声明和 changelog 展示；移动端目录折叠 |
| 发布确认页（仪表盘内） | `/admin/articles/new` 上传 → 预览 → 填写 changelog → 确认发布 |

**交付物**：3 个页面 + 基础样式 + middleware（语言重定向）

---

## 阶段3：知识库（基础版）

**目标**：词条基础框架——状态机、文件存储、API、前端页面、仪表盘管理。

**不依赖 AI，不依赖队列**。

> **设计说明**：词条有完整的生命周期（proposed → creating → unreviewed → reviewed）。
> 阶段 3 实现状态机的前半段（proposed/unreviewed/reviewed 的 CRUD），`creating` 状态的 AI 填充留到后续阶段。
> 手动新建词条 = 申请（proposed）→ 立即审批通过 → creating → 手动标记完成 → unreviewed → 审查通过 → reviewed。

---

### 模块 3.1：词条后端 API

| 任务 | 验收标准 |
|------|----------|
| 词条文件区块解析器 + frontmatter | `lib/wiki/parser.ts` 能解析 DEF/HUMAN/AI/REF 区块，`lib/articles/frontmatter.ts` 处理 frontmatter |
| 创建词条 API | `POST /api/wiki`，只接收 `name` + `language`，状态为 `proposed` |
| 审批通过 API | `POST /api/wiki/[name]/approve`，`proposed` → `creating`（阶段 3 模拟为直接可用） |
| 词条列表 API | `GET /api/wiki?lang=zh`，默认返回 `unreviewed` + `reviewed`，管理员可用 `?status=` 参数 |
| 词条详情 API | `GET /api/wiki/[name]?lang=zh`，返回 frontmatter + 各区块内容 |
| 更新词条 API | `PUT /api/wiki/[name]?lang=zh`，仅 `unreviewed`/`reviewed` 可编辑 |
| 审查通过 API | `POST /api/wiki/[name]/review`，`unreviewed` → `reviewed` |
| 删除词条 API | `DELETE /api/wiki/[name]?lang=zh`，删除文件和数据库记录 |

**数据库模型**：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (UUID) | 主键 |
| name | String | 主名称 |
| aliases | String[] | 别名列表 |
| language | Enum (zh, en) | 语言 |
| definition | Text | 定义型内容 |
| contentPath | String | 文件路径 |
| tags | String[] | 标签 |
| accessGroup | String[] | 权限组 |
| status | Enum (proposed, creating, unreviewed, reviewed) | 生命周期状态 |
| createdAt | DateTime | |
| updatedAt | DateTime | |

- `@@unique([name, language])`：唯一约束

**文件格式**：

```markdown
---
name: DFS
aliases: [深度优先搜索]
language: zh
tags: [算法]
status: reviewed
accessGroup: []
---

<!-- DEF_START -->...<!-- DEF_END -->
<!-- HUMAN_START -->...<!-- HUMAN_END -->
<!-- AI_START -->...<!-- AI_END -->
<!-- REF_START -->...<!-- REF_END -->
```

区块顺序：`DEF` → `HUMAN` → `AI` → `REF`
反向链接动态生成，不写入文件。

**交付物**：8 个 API 端点 + 单元测试 + 解析器 + 集成测试

---

### 模块 3.4：词条前端页面

| 任务 | 验收标准 |
|------|----------|
| 词条列表页 | `/{lang}/wiki`，展示 `reviewed` 词条，支持分页 |
| 词条阅读页 | `/{lang}/wiki/[name]`，展示词条内容 |

**阅读页布局**（阶段3 实现）：
- 标题区：主名称 + 别名列表
- 定义型内容区（DEF 区块）
- 博主笔记区（HUMAN 区块）
- AI 补充区：预留占位
- 文章引用区：预留占位
- 反向链接区：预留占位

**交付物**：2 个页面 + 基础样式

---

### 模块 3.5：仪表盘词条管理

| 任务 | 验收标准 |
|------|----------|
| 词条列表页 | `/admin/wiki`，按状态分组展示词条（proposed/creating/unreviewed/reviewed） |
| 创建词条 | 只输入主名称 + 语言 → 提交申请（proposed）→ 自动审批通过 → creating |
| 编辑词条 | 可编辑 `unreviewed`/`reviewed` 状态的词条（所有字段 + 四个区块） |
| 审批词条 | `unreviewed` → `reviewed`（审查通过按钮） |
| 删除词条 | 确认后删除 |

**交付物**：仪表盘管理界面

---

### 开发顺序（阶段3 内部）

```
3.1 词条后端 API（状态机 + 文件存储 + frontmatter）
    ↓
3.4 词条前端页面（只显示 reviewed 词条）
    ↓
3.5 仪表盘词条管理（按状态分组管理）
    ↓
[后续阶段] 3.2 词条链接检测（依赖 AI 填充完成的词条定义）
    ↓
[后续阶段] 3.3 词条 hover 预览（依赖 3.2 的 data 属性）

---

## 阶段4：队列基础设施

**目标**：能异步处理长时间 AI 任务。

| 任务 | 验收标准 |
|------|----------|
| 4.1 Bull 队列初始化 | `lib/queue/client.ts` 导出队列实例 |
| 4.2 任务生产者 | `lib/queue/producer.ts` 提供 `addJob(type, data)` |
| 4.3 任务状态 API | `GET /api/ai/status?id=xxx` 返回任务状态 |
| 4.4 Worker 框架 | `worker.ts` 能启动，消费队列中的任务 |
| 4.5 AiTask 数据库表 | Prisma schema 包含 `AiTask` 模型 |

**交付物**：队列系统完整可用 + 集成测试（用 Mock 任务验证）

---

## 阶段5：AI 任务集成

**目标**：实现具体的 AI 功能。

### 模块 5.1：DeepSeek API 封装

| 任务 | 验收标准 |
|------|----------|
| 封装 `callDeepSeek` 函数 | 支持 prompt 输入，返回字符串，带重试逻辑 |
| 提示词管理 | `lib/ai/prompts/` 目录下有各功能模板 |

**交付物**：`lib/ai/client.ts` + 单元测试（Mock）

### 模块 5.2：AI 审查功能

| 任务 | 验收标准 |
|------|----------|
| 提交审查 API | `POST /api/ai/review` 创建队列任务，返回 taskId |
| 审查任务处理函数 | Worker 中实现，调用 DeepSeek，生成结构化报告 |
| 审查报告展示页面（仪表盘） | 展示报告的各板块、问题条目、行号+原文摘录 |
| 发布流程集成 | 发布前可选择提交审查，审查完成后显示红点提示 |

**交付物**：完整审查功能 + E2E 测试

### 模块 5.3：AI 翻译功能

| 任务 | 验收标准 |
|------|----------|
| 提交翻译 API | `POST /api/ai/translate` |
| 增量翻译逻辑 | 对比原文变更段落，只翻译修改部分 |
| 译文保存 | 生成独立的 MD 文件，标注"AI翻译" |
| 翻译状态管理 | 仪表盘文章列表显示翻译版本状态 |

**交付物**：翻译功能 + 集成测试

### 模块 5.4：AI 词条发现与生成

| 任务 | 验收标准 |
|------|----------|
| 发布时扫描新概念 | 返回词条提议列表 |
| 词条提议审批 API | `POST /api/ai/proposals/approve` |
| 词条生成任务 | Worker 中生成中英文词条（定义型+教程型） |
| 仪表盘词条提议板块 | 展示提议，支持同意/驳回/修改 |

**交付物**：词条发现+生成完整流程

---

## 阶段6：仪表盘完善

**目标**：所有管理功能集中在一个界面。

| 任务 | 验收标准 |
|------|----------|
| 6.1 文章板块 | 列表、新建、编辑、删除、发布入口 |
| 6.2 知识库板块 | 词条列表、手动词条编辑、词条提议审批 |
| 6.3 通知板块 | 显示需要处理的通知（评论违规、词条申请） |
| 6.4 活动日志 | 显示博客动态（按时间线） |
| 6.5 基础设置 | 站点标题、正文宽度等（先硬编码几个配置项） |

**交付物**：完整的仪表盘前端页面

---

## 阶段7：前端交互完善

**目标**：读者端的高级交互。

### 模块 7.1：AI 对话窗口

| 任务 | 验收标准 |
|------|----------|
| 悬浮按钮 + 抽屉组件 | 右下角固定按钮，点击从右侧滑出 |
| 对话 API | `POST /api/chat` 调用 DeepSeek，返回回答 |
| 选中文本快捷提问 | 选中文本后悬浮按钮变为快捷入口 |

**交付物**：对话窗口完整功能

### 模块 7.2：评论功能（简化版）

| 任务 | 验收标准 |
|------|----------|
| 评论发表 API | `POST /api/comments`，仅需填写昵称+内容 |
| 评论列表 API | `GET /api/comments?articleId=xxx` |
| 前端评论组件 | 文章页底部显示评论列表和发表框 |
| AI 初审（简化） | 调用 DeepSeek 判断不当内容，返回 `isHidden` |

**交付物**：评论功能 + 基础 AI 初审
