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

## 快速开始（开发环境）

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

## 生产环境部署

### 前置条件

- 一台 Linux 服务器（Ubuntu 22.04+ 或 Debian 12+ 推荐）
- Node.js 20+
- Docker + Docker Compose
- Nginx（或 Caddy 等反向代理）
- 域名（可选但推荐）
- DeepSeek API Key

### 1. 配置环境变量

复制 `.env.example` 到 `.env`，务必修改以下敏感值：

```bash
cp .env.example .env
```

| 变量 | 说明 | 要求 |
|------|------|------|
| `POSTGRES_PASSWORD` | 数据库密码 | **必须设置，使用强密码** |
| `REDIS_PASSWORD` | Redis 密码 | **必须设置，使用强密码** |
| `DATABASE_URL` | PostgreSQL 连接串 | 格式：`postgresql://<user>:<password>@localhost:5432/<db>` |
| `REDIS_URL` | Redis 连接串 | 格式：`redis://:<password>@localhost:6379` |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | 必填 |
| `NEXTAUTH_SECRET` | NextAuth 会话密钥 | **必须设置**，可用 `openssl rand -base64 32` 生成 |
| `NEXTAUTH_URL` | 站点完整 URL | 如 `https://blog.example.com` |
| `SITE_URL` | 站点根 URL | 如 `https://blog.example.com` |

### 2. 启动数据库（Docker）

```bash
# 使用生产 Compose 文件启动 PostgreSQL + Redis
# 敏感密码从 .env 读取，避免硬编码
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

相比开发版本，生产 Compose 的差异：
- 密码通过 `.env` 传入，不硬编码
- 使用 `-alpine` 精简镜像
- 添加健康检查
- 端口绑定到 `127.0.0.1`（仅本地可访问）
- 启用 Redis AOF 持久化
- 添加 `restart: unless-stopped` 自动重启

### 3. 运行数据库迁移

```bash
npx prisma migrate deploy
```

> 使用 `migrate deploy` 而非 `migrate dev`，安全地在生产环境执行迁移。

### 4. 构建并启动应用

```bash
# 构建生产版本
npm run build

# 使用进程管理器启动（下面以 pm2 为例）
npm install -g pm2

# 启动 Next.js 应用（默认 3000 端口）
pm2 start npm --name "miniese-blog" -- start

# 启动 AI Worker
pm2 start npm --name "miniese-worker" -- run worker

# 保存 pm2 配置以支持开机自启
pm2 save
pm2 startup
```

### 5. 配置反向代理（Nginx）

创建 `/etc/nginx/sites-available/miniese-blog`：

```nginx
server {
    listen 80;
    server_name blog.example.com;

    # 301 重定向到 HTTPS（如果已配置 SSL）
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name blog.example.com;

    ssl_certificate /etc/letsencrypt/live/blog.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/blog.example.com/privkey.pem;

    # SSL 配置（Mozilla 现代配置）
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    # 反向代理到 Next.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # SSE 支持（AI 聊天流）
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }

    # 静态资源缓存
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }

    location /public {
        proxy_pass http://127.0.0.1:3000;
        expires 30d;
        add_header Cache-Control "public";
    }
}
```

启用并测试：

```bash
sudo ln -s /etc/nginx/sites-available/miniese-blog /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

> 推荐使用 [Let's Encrypt](https://letsencrypt.org) 免费 SSL 证书：
> ```bash
> sudo apt install certbot python3-certbot-nginx
> sudo certbot --nginx -d blog.example.com
> ```

### 6. 创建管理员账号

```bash
npm run create-admin
```

### 7. 验证

- 访问 `https://blog.example.com` 确认前台正常
- 访问 `https://blog.example.com/login` 登录管理员
- 访问 `https://blog.example.com/admin` 确认后台正常
- 确认 Worker 已启动：`pm2 status`

### 安全注意事项

- **防火墙**：确保只开放 80（HTTP）和 443（HTTPS）端口，数据库端口（5432、6379）仅绑定到 `127.0.0.1`
- **自动更新**：定期运行 `sudo apt update && sudo apt upgrade` 保持系统安全
- **备份数据库**：定期备份 PostgreSQL 数据：`docker compose -f docker-compose.prod.yml exec postgres pg_dump -U miniese miniese > backup.sql`
- **监控 Worker**：建议设置 pm2 告警或使用 systemd 监控 Worker 进程
- **日志轮转**：pm2 默认不会轮转日志，建议配置 `pm2 install pm2-logrotate`

### pm2 常用命令

```bash
pm2 status                    # 查看所有进程状态
pm2 logs miniese-blog         # 查看应用日志
pm2 logs miniese-worker       # 查看 Worker 日志
pm2 restart miniese-blog      # 重启应用
pm2 restart miniese-worker    # 重启 Worker
pm2 monit                     # 实时监控
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
