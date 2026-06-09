# Agent 工作流规范 v1.0

> 本文档定义 AI Agent 在开发 Miniese's Blog 项目时应遵循的工作流程、代码规范、文档更新和汇报要求。

---

## 1. 核心原则

1. **文档先行**：修改代码前，先更新相关文档
2. **测试驱动**：编写代码前，先写测试用例（或同时编写）
3. **增量交付**：每完成一个模块，立即提交并汇报
4. **透明可追溯**：所有变更记录在 `docs/development-log.md`

---

## 2. 任务接收格式

每个任务指令包含以下信息：

```markdown
## 任务 ID：[日期-序号，如 2026-06-09-01]

### 模块名称
[如：阶段2.2 文章基础 CRUD]

### 目标
[一句话描述]

### 验收标准
- [ ] 标准1
- [ ] 标准2

### 依赖
- [已完成的任务 ID]

### 相关文档
- `docs/PRD.md` 中的 [章节]
- `docs/architecture.md` 中的 [章节]
- `docs/development-order.md` 中的 [任务 ID]

### 额外说明
[可选]
```

**Agent 收到任务后**：
- 确认理解目标
- 若文档有歧义，提出澄清问题
- 开始工作前，在 `development-log.md` 记录开始时间

---

## 3. 开发流程

### 3.1 标准工作流

```
1. 阅读相关文档
   │
2. 编写测试用例（单元测试/集成测试）
   │
3. 实现功能代码
   │
4. 运行测试，确保通过
   │
5. 更新相关文档（如有变更）
   │
6. 更新 development-log.md
   │
7. 提交代码（git commit）
   │
8. 汇报完成
```

### 3.2 代码规范

| 项目 | 要求 |
|------|------|
| 语言 | TypeScript，严格模式（`strict: true`） |
| 命名 | 变量/函数：camelCase；类/接口：PascalCase；常量：UPPER_SNAKE_CASE |
| 注释 | 公共函数必须有 JSDoc 注释 |
| 类型 | 禁止使用 `any`，必要时用 `unknown` |
| 错误处理 | 使用 `try/catch`，记录错误日志 |
| 异步 | 优先使用 `async/await` |

### 3.3 测试要求

| 类型 | 覆盖率要求 | 说明 |
|------|------------|------|
| 单元测试 | ≥ 80% | 测试纯函数、工具函数 |
| 集成测试 | 核心 API 全部覆盖 | 使用 Supertest + 测试数据库 |
| E2E 测试 | 只测核心路径（可选） | 使用 Playwright |

**测试文件位置**：
- 单元测试：与源文件同目录，`*.test.ts`
- 集成测试：`tests/integration/`
- E2E 测试：`tests/e2e/`

### 3.4 文档更新要求

| 变更类型 | 需更新的文档 |
|----------|--------------|
| 功能逻辑变更 | `docs/PRD.md`（如影响需求） |
| 技术实现变更 | `docs/architecture.md` |
| 数据库 schema 变更 | `prisma/schema.prisma` + `docs/architecture.md` |
| API 接口变更 | `docs/contracts/*.ts`（如有） |
| 任务顺序/依赖变更 | `docs/development-order.md` |
| 所有变更 | `docs/development-log.md` + `CHANGELOG.md` |

### 3.5 Git 提交规范

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**type**：
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `test`: 测试相关
- `refactor`: 重构
- `chore`: 构建/工具配置

**示例**：`feat(article): add publish API with review option`

---

## 4. 汇报格式

### 4.1 任务完成汇报模板

```markdown
## 任务完成：[任务 ID]

### 完成内容
- [简述完成的功能]

### 验收标准检查
- [x] 标准1
- [x] 标准2

### 变更文件
- `src/xxx.ts` (新增/修改)
- `tests/xxx.test.ts` (新增)

### 测试结果
- 单元测试：XX 个通过，0 失败
- 集成测试：XX 个通过，0 失败

### 文档更新
- [x] `docs/architecture.md` 更新了 X 节
- [x] `docs/development-log.md` 追加记录

### 已知问题
- [列出已知问题，若无则写"无"]

### 下一步建议
- [建议下一个任务或注意事项]
```

### 4.2 遇到问题时的汇报

```markdown
## 问题报告：[任务 ID]

### 问题描述
[清晰描述问题]

### 已尝试的解决方案
1. ...
2. ...

### 需要的帮助
- [是否需要修改契约/文档/依赖]
- [是否需要技术决策]

### 临时建议
[可选]
```

---

## 5. 文档维护责任

### 5.1 `docs/development-log.md` 格式

```markdown
# 开发日志

## [2026-06-09]

### 任务 2026-06-09-01：阶段2.2 文章基础 CRUD
- **开始时间**：10:00
- **结束时间**：14:30
- **状态**：✅ 完成
- **变更摘要**：实现文章发布、列表、详情 API
- **测试结果**：12/12 通过
- **遇到的问题**：无

### 任务 2026-06-09-02：...
```

### 5.2 `CHANGELOG.md` 格式

面向用户（或开发者）的版本更新记录，按版本倒序排列。

```markdown
# Changelog

## [v0.1.0] - 2026-06-15 (预计)

### Added
- 支持 Markdown/Notesaw 文章发布和阅读
- 知识库基础功能（手动词条、自动链接）
- AI 文章审查功能
- AI 文章翻译功能（手动触发）
- 读者对话窗口

### Changed
- 无

### Fixed
- 无
```

每次完成一个阶段后，Agent 应建议更新 `CHANGELOG.md`（由你决定是否合并）。

---

## 6. 代码审查与合并

- **每次任务完成后**，Agent 提交 PR（或直接 push 到 `dev` 分支）
- 你负责审查代码，重点关注：
  - 是否符合需求
  - 测试是否充分
  - 文档是否更新
- 审查通过后，合并到 `main` 分支

---

## 7. 项目启动包清单

Agent 在开始第一个任务前，应确保以下文件存在且内容正确：

```
miniese-blog/
├── README.md               # 项目简介 + 快速启动指南
├── CHANGELOG.md            # 版本更新记录
├── .env.example            # 环境变量模板
├── docker-compose.yml      # 开发环境编排
├── package.json            # 依赖脚本
├── prisma/
│   └── schema.prisma       # 数据库 schema（初版）
├── docs/
│   ├── PRD.md
│   ├── MVP.md
│   ├── architecture.md
│   ├── development-order.md
│   ├── development-log.md  # 空
│   └── agent-workflow.md   # 本文档
└── src/                    # 空目录（占位）
```

---

## 8. 开始工作

Agent 收到第一个任务（如“阶段1：基础环境搭建”）后，应：

1. 阅读 `docs/architecture.md` 和 `docs/development-order.md` 中相关章节
2. 按照本文档的流程开始工作
3. 完成任务后按汇报模板回复

---

# 附录：README.md 框架

```markdown
# Miniese's Blog

一个具有 AI 助手（Miniese）的个人技术博客+知识库系统。

## 特性

- 📝 支持 Markdown 和 Notesaw 语法
- 🤖 AI 助手：文章审查、翻译、词条生成
- 📚 知识库：词条管理、双向链接
- 💬 读者对话：选中文本向 AI 提问
- 🌐 多语言支持（中/英文）
- 🔒 可扩展的权限控制（预留）

## 快速启动

### 前置要求

- Node.js 20+
- Docker（用于 PostgreSQL 和 Redis）

### 安装

```bash
git clone ...
npm install
cp .env.example .env
# 编辑 .env 填入必要的 API Key
docker-compose up -d
npx prisma migrate dev
npm run dev
```

访问 `http://localhost:3000`

## 项目结构

参见 `docs/architecture.md`

## 开发指南

参见 `docs/agent-workflow.md`

## 许可证

[待定]
```

---

# 附录：CHANGELOG.md 初始框架

```markdown
# Changelog

所有显著的项目变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- 项目初始化（Next.js + Tailwind + Prisma）
- 基础文档（PRD, MVP, 架构设计, 开发顺序, Agent 工作流）

### Changed
- 无

### Fixed
- 无

### Removed
- 无
```