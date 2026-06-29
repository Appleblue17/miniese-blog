# Miniese's Blog

> Miniese's Blog：一个由 AI 辅助的博客与知识库系统。

Miniese's Blog 是一个把笔记变成知识网络的工具。它不止是博客，更是一个由 AI 辅助维护的个人知识库。发布文章时，AI 助手 Miniese 会自动审查、翻译、发现并生成词条，让知识从独立文档变成相互关联的有机体。它内置了一位 AI 助手 Miniese——她负责审查文章、增量翻译、自动发现和生成知识词条，并与读者对话。你负责写作，剩下的交给她。

- ✍️ 发布文章：支持 Markdown 与 [Notesaw](https://github.com/Appleblue17/Notesaw) 语法
- 🧠 知识库：自动关联词条，双向链接
- 🤖 AI 助手：草稿审查、文章翻译、发现与生成词条、与读者对话
- 🌐 多语言：中英文内容自动翻译与关联

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16（App Router） |
| 语言 | TypeScript 5（strict mode） |
| 样式 | Tailwind CSS 4 + shadcn/ui |
| 数据库 | PostgreSQL 16 + Prisma 7 |
| 队列 | Bull + Redis 7 |
| AI | DeepSeek API |
| 认证 | NextAuth.js v5 |
| 测试 | Vitest v4 + Supertest |

## 快速开始

### 前置条件
- Node.js 20+
- Docker（PostgreSQL 16 + Redis 7）
- DeepSeek API Key

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-username/miniese-blog.git
cd miniese-blog

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY 等必要配置

# 启动数据库
docker compose up -d

# 初始化数据库
npx prisma migrate dev

# 启动开发服务器
npm run dev

# 新终端窗口，启动 AI Worker
npm run worker
```

打开 `http://localhost:3000` 即可访问。

### 创建管理员

```bash
npm run create-admin
```

### 测试

```bash
npm test           # 运行所有测试
npm run test:watch # 监听模式
npm run test:coverage  # 覆盖率报告
```

当前 363 个测试全部通过（29 个测试文件）。

### 构建

```bash
npm run build
npm run start
```

## 项目结构

```
miniese-blog/
├── prisma/              # 数据库 schema + 迁移
├── config/              # 站点设置（默认 + 自定义覆盖）
├── content/             # Markdown 源文件
│   ├── articles/        #   zh/ en/ drafts/
│   └── wiki/            #   zh/ en/
├── public/              # 静态资源（图片、CSS）
├── packages/notesaw/    # 自定义 Notesaw 解析器
├── src/
│   ├── app/             # Next.js 页面 + API 路由
│   │   ├── (public)/    #   博客前端页面
│   │   ├── (dashboard)/ #   管理后台
│   │   └── api/         #   API 路由
│   ├── components/      # UI 组件
│   ├── lib/             # 核心逻辑
│   │   ├── ai/          #   AI 功能（审查/翻译/发现/生成）
│   │   ├── markdown/    #   渲染管线
│   │   ├── articles/    #   文章逻辑
│   │   ├── wiki/        #   词条逻辑
│   │   └── queue/       #   Bull 队列
│   ├── types/           # TypeScript 类型
│   └── worker.ts        # AI 队列 Worker
├── tests/               # 集成测试
└── docs/                # 项目文档
```

## 文档

| 文档 | 说明 |
|------|------|
| [docs/PRD.md](docs/PRD.md) | 产品需求文档 |
| [docs/architecture.md](docs/architecture.md) | 技术架构 |
| [docs/MVP.md](docs/MVP.md) | MVP 范围划定 |
| [docs/user-guide.md](docs/user-guide.md) | 用户指南 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 变更日志 |

## 许可证

MIT License. 详情请参阅 [LICENSE](LICENSE) 文件。
