# 开发顺序 v1.0

> 本文档定义模块的开发顺序，以及每个模块的验收标准。Agent 应按顺序逐模块实现。如需修改请明确提出并做好记录。

## 0、修改记录

**最后更新**：2026-06-11

### v1.3.0 2026-06-11

- 阶段 5.2：AI 审查功能完整实现
- 修复：`queue.test.ts` 外键约束（测试中创建真实 Article 记录）
- 修复：Detail 页遗留的旧渲染代码改为客户端 `<ReviewChunkList>` 组件
- 修复：severity 筛选从多选 checkbox 改为四级分级模式

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

| 任务 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 创建词条 | POST | `/api/wiki` | 接收元信息 + 内容，保存 MD 文件，写入数据库 |
| 获取词条列表 | GET | `/api/wiki?lang=zh` | 支持分页、按语言筛选 |
| 获取词条详情 | GET | `/api/wiki/[name]?lang=zh` | 返回词条数据和渲染后的 HTML |
| 更新词条 | PUT | `/api/wiki/[name]?lang=zh` | 更新内容，重新渲染 |
| 删除词条 | DELETE | `/api/wiki/[name]?lang=zh` | 删除文件和数据库记录 |

**文件存储**：
- 路径：`content/wiki/{lang}/{name}.md`
- 文件包含 frontmatter 存储元数据（主名称、别名、定义型内容、标签、可见性等）

**API 验收**：
- [ ] 创建后文件存在于正确路径
- [ ] 数据库记录正确
- [ ] 列表按名称排序
- [ ] 详情返回完整内容

---

### 模块 3.2：词条链接检测

位置：`src/lib/markdown/linkDetector.ts`

| 任务 | 说明 |
|------|------|
| 获取词条数据 | 从数据库读取当前语言的所有词条（名称 + 别名列表） |
| 匹配文本 | 在文章 MD 内容中匹配词条名称或别名（全词匹配，避免匹配到子串） |
| 替换链接 | 将匹配的文本替换为 `<a href="/{lang}/wiki/{name}" data-wiki-name="{name}">` |
| 集成到渲染流程 | 在 `renderMarkdown` 调用前执行链接检测 |

**注意事项**：
- 只替换独立词条，不替换代码块、公式内的文本
- 别名替换时保持原文大小写，链接中 name 使用主名称
- 同个词条在文章中多次出现都要替换

**验收**：
- [ ] 单元测试覆盖匹配逻辑
- [ ] 文章渲染后词条变为可点击链接

---

### 模块 3.3：词条 hover 预览

位置：`src/components/wiki/WikiPreview.tsx`

| 任务 | 说明 |
|------|------|
| 监听悬停 | 监听页面内 `[data-wiki-name]` 链接的 `mouseenter` 事件 |
| 获取数据 | 调用 `/api/wiki/[name]?lang=current` 获取定义型内容（或预加载） |
| 弹出卡片 | 300ms 延迟后显示卡片，包含定义型内容 + "查看完整词条" 按钮 |
| 卡片定位 | 跟随鼠标或显示在链接附近 |
| 移动端 | tap and hold 触发（简化实现，先不做完美） |

**验收**：
- [ ] 悬停词条链接后显示卡片
- [ ] 点击按钮跳转到词条页
- [ ] 离开后卡片消失

---

### 模块 3.4：词条前端页面

#### 列表页 `/{lang}/wiki`

| 内容 | 说明 |
|------|------|
| 页面标题 | "知识库" |
| 词条卡片 | 显示词条名称、别名、简短定义（定义型内容截断） |
| 搜索/筛选 | 按名称搜索（MVP 可先不做） |
| 分页 | 与文章列表类似 |

#### 阅读页 `/{lang}/wiki/[name]`

按 PRD 第 4.3.4 节，阶段3 实现以下部分：

| 区域 | 实现状态 |
|------|----------|
| 标题区 | ✅ 主名称 + 别名列表（标签形式） |
| 定义型内容区 | ✅ 显示定义型内容，标注"AI生成"（如有） |
| 博主笔记 | ✅ 显示人类撰写内容，无额外标注 |
| AI 补充 | 🔘 预留占位，显示"待添加" |
| 文章引用区 | 🔘 预留占位 |
| 反向链接区 | 🔘 预留占位 |

**注**：博主笔记是手动创建/编辑时填写的内容，与定义型内容分开存储（都在同一个 MD 文件中，通过 frontmatter 或标记区分）。

---

### 模块 3.5：仪表盘词条管理

位置：`/admin/wiki`

| 功能 | 说明 |
|------|------|
| 词条列表 | 显示所有词条（名称、语言、是否 AI 生成、是否已审查） |
| 创建词条 | 表单填写：主名称、别名（可多个）、语言、定义型内容、博主笔记、标签、可见性 |
| 编辑词条 | 同上，加载已有数据 |
| 删除词条 | 确认后删除 |

**表单字段**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 主名称 | text | ✅ | 英文为主，中文也可 |
| 别名 | text[] | 可选 | 多个别名用逗号或回车分隔 |
| 语言 | select | ✅ | zh / en |
| 定义型内容 | textarea | ✅ | 简短定义，用于 hover 预览 |
| 博主笔记 | textarea | 可选 | 人类撰写内容，支持 Markdown |
| 标签 | text[] | 可选 | |
| 可见性 | select | 可选 | 公开 / 校内 |

**文件格式**：词条 MD 文件使用 frontmatter 存储元数据，博主笔记作为正文内容。

```markdown
---
name: "TypeScript"
aliases: ["TS", "类型脚本"]
language: "zh"
definition: "TypeScript 是 JavaScript 的静态类型超集"
tags: ["编程语言"]
accessGroup: []
isAIGenerated: false
isReviewed: true
---

# 博主笔记

这里是手动撰写的详细内容...
```

---

### 开发顺序（阶段3 内部）

3.1 词条后端 API（状态机 + 文件存储 + frontmatter）
    ↓
3.4 词条前端页面（只显示 reviewed 词条）
    ↓
3.5 仪表盘词条管理（按状态分组管理）
    ↓
3.2 词条链接检测（依赖 AI 填充完成的词条定义）
    ↓
3.3 词条 hover 预览（依赖 3.2 的 data 属性）

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

**目标**：实现 AI 审查、翻译、词条生成功能，接入队列系统。

**依赖**：阶段4 队列基础设施已完成。

---

### 模块 5.1：DeepSeek API 封装

| 任务 | 说明 |
|------|------|
| API 客户端 | `lib/ai/client.ts`，封装 `callDeepSeek(prompt, options)` |
| 重试机制 | 失败自动重试 3 次（指数退避） |
| Token 记录 | 每次调用记录消耗 token 数 |
| 响应解析 | 支持 JSON 模式，自动处理非标准响应 |

**完成状态**: ✅

---

### 模块 5.2：AI 审查功能

| 任务 | 说明 |
|------|------|
| 内容拆分器 | `lib/ai/chunker.ts`，按标题层级/段落拆分文章，支持大小边界控制（MIN_CHUNK_SIZE=1000, TARGET_CHUNK_SIZE=5000, MAX_CHUNK_SIZE=8000） |
| 审查 Prompt | 设计结构化输出格式（JSON），severity 字段放最后，包含 "ok" 等级 |
| Worker 处理 | `processReview` 调用 DeepSeek API，串行处理每个 chunk，fire-and-forget 更新进度到 DB |
| 报告存档 | 存入 `AiTask.output`，支持历史查询 |
| 段落进度 | Worker 写入 `output.progress`（totalChunks + processedChunks），前端轮询展示进度条 |
| 审查历史 API | `GET /api/admin/reviews`（分页）、`GET /api/admin/reviews/[id]` |
| 仪表盘列表页 | `/admin/reviews` — 分页列表，显示文章标题、状态、时间、问题数 |
| 仪表盘详情页 | `/admin/reviews/[id]` — Summary 卡片 + `<ReviewChunkList>` 客户端组件 |
| PublishForm 集成 | 文章管理页"AI 审查"按钮 → 轮询 → 完成后跳转到详情页 |

**审查 Prompt 要点**：
- 输入：文章块内容（Markdown）
- 注意事项：Notesaw 自定义语法（`---`、`:::`、`> >`）不需要审查；可能是长文章的片段，整体结构评价不在范围内
- 输出：按 `factual`、`typo`、`clarity`（替换旧的 `structure`）、`other` 四类分组
- 每个 item 字段顺序：`lineStart → lineEnd → snippet → issue → suggestion → severity`（severity 放最后，AI 做完分析再判定）
- severity 可选值：`"error"` / `"warning"` / `"suggestion"` / `"ok"`（ok 表示检查后确认没问题）

**ReviewChunkList 组件特性**：
- 每个段落默认折叠，点击 header 展开/收起
- Header 显示各 severity 的计数色块（红/黄/蓝/绿圆点 + 数字）
- 右上角四级筛选菜单：>= 错误 / >= 警告 / >= 建议 / 全部
- 展开后按 section 类型分组，item 内按 severity 降序排列
- 筛选后无匹配项时 filter bar 始终可见，下方显示空状态提示

**完成状态**: ✅

---

### 模块 5.3：AI 翻译功能

| 任务 | 说明 |
|------|------|
| 段落变更检测 | 复用审查的段落对比逻辑 |
| 翻译 Prompt | 保持 Markdown 结构，只翻译文本内容 |
| Worker 处理 | `processTranslate` 增量翻译，生成译文文件 |
| 手动触发 API | `POST /api/ai/translate` |
| 仪表盘入口 | 文章管理页增加"翻译"按钮 |

**增量翻译策略**：
- 对比原文新旧版本，找出变更段落
- 只翻译变更段落，其他从已有译文复用
- 首次翻译时全量翻译

---

### 模块 5.4：AI 词条生成功能

| 任务 | 说明 |
|------|------|
| 概念扫描器 | `lib/ai/conceptScanner.ts`，从文章中提取候选词条 |
| 词条提议生成 | 发布文章时自动扫描，存入 `WikiProposal` 表 |
| 仪表盘审批页 | 展示提议列表，支持同意/驳回/修改 |
| Worker 生成 | 审批后调用 `processGenerate` 创建中英文词条 |
| 词条内容生成 Prompt | 输出定义型内容 + 别名列表 + 详细解释 |

**词条提议表**（新增 `WikiProposal`）：

| 字段 | 说明 |
|------|------|
| id | 主键 |
| name | 候选词条名 |
| sourceArticleId | 来源文章 |
| sourceContext | 来源上下文（摘录） |
| status | pending / approved / rejected |
| createdAt | |

---

### 开发顺序（阶段5 内部）

```
5.1 DeepSeek API 封装
    ↓
5.2 AI 审查功能（核心，工作量最大）
    ↓
5.4 AI 词条生成功能（与审查共享扫描逻辑）
    ↓
5.3 AI 翻译功能（相对独立）
```

---

### 验收标准

- [x] 能对文章进行 AI 审查，返回结构化报告
- [x] 长文章自动按标题/段落拆分处理
- [x] 审查报告可存档、可追溯历史版本
- [x] 仪表盘可查看审查历史详情（块导航 + 问题列表）
- [ ] 能对文章进行增量翻译，生成译文
- [ ] 发布文章时自动扫描词条提议
- [ ] 仪表盘可审批词条提议，AI 自动生成词条

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
