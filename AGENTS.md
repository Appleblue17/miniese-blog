# AGENTS.md — Miniese's Blog

## Project Description

**Miniese's Blog** is a personal blog + knowledge base system with an integrated AI assistant named Miniese. It targets technical content creators who want a unified platform for writing, knowledge management, and AI-powered content assistance.

### Main Purpose & Goals
- Provide a rich blog publishing platform supporting **Markdown** and the custom **Notesaw** syntax
- Maintain a wiki/knowledge base with automatic article-to-term linking (bidirectional links)
- Integrate an **AI assistant (Miniese)** for article review, translation, changelog generation, term discovery, and reader Q&A
- Support **multi-language** content (Chinese/English) with incremental AI translation
- Offer a **dashboard** for the admin to manage articles, wiki entries, AI proposals, and site settings
- Enable **reader interaction** through comments, AI chat, and term-suggestion requests

### Key Technologies
| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | **Next.js 16** (App Router) | Full-stack, SSR/SSG |
| Language | **TypeScript 5** | Strict mode enabled |
| Styling | **Tailwind CSS 4** | Utility-first CSS |
| UI Components | **shadcn/ui** (planned) | New York style, Neutral theme |
| Database | **PostgreSQL 16** via Docker | Prisma ORM |
| Queue | **Bull** + **Redis 7** | Async AI task processing |
| AI Integration | **DeepSeek API** | Changelog, review, translation, term generation |
| Email | **Resend SDK** | Notifications (planned) |
| Auth | **NextAuth.js** (planned) | MVP uses simple password protection |
| Containerization | **Docker Compose** | Dev: PG + Redis in containers |

## Architecture Overview

### High-Level Architecture
The system follows a **Next.js full-stack** architecture with a separate **Queue Worker** process for long-running AI tasks.

```
+---------------------------------------+
|        Next.js Application             |
|  +-----------+  +-------------+       |
|  |  Pages/   |  | API Routes  |       |
|  |Components |  |  (short)    |       |
|  +-----------+  +-------------+       |
+------------------+--------------------+
                   | creates job
                   v
+---------------------------------------+
|        Redis Queue (Bull)              |
+------------------+--------------------+
                   | consumes
+------------------+--------------------+
|         Worker Process                 |
|   AI Review / AI Translation          |
|   AI Term Generation / Scan           |
+------------------+--------------------+
                   | updates DB
+------------------+--------------------+
|          PostgreSQL (Prisma)           |
+---------------------------------------+
```

### Main Components & Relationships
| Component | Responsibility | Communication |
|-----------|---------------|---------------|
| **Next.js App** | Page rendering, short API tasks (list, CRUD, chat) | Direct DB queries via Prisma |
| **Redis Queue** | Store long-running AI tasks via Bull | Producer creates jobs, Worker consumes |
| **Worker** | Separate Node process consuming queue tasks | Calls DeepSeek API, writes results to DB |
| **PostgreSQL** | Primary data store | Prisma ORM with type-safe queries |
| **File System** | Store Markdown source files | `content/` directory, Git-managed |

### Data Flow
1. **User request** -> Next.js API Route -> direct response (short task) OR create queue job (long task)
2. **Queue job** -> Worker picks up -> calls DeepSeek API -> updates DB
3. **Frontend** polls `/api/ai/status?id=xxx` for task completion
4. **Article rendering**: Markdown source -> remark/rehype pipeline -> HTML with wiki links injected

### MVP Scope
- **P0 features**: Article publishing (Markdown + Notesaw), wiki CRUD, auto wiki linking & hover preview, AI review/translation/term generation, reader chat, admin dashboard
- **P1 deferred**: Comments AI review, auto-translate, image permissions, version history
- **P2 deferred**: School OAuth, reader term suggestions, Git auto-commit

## Directory Structure

```
miniese-blog/
|-- docker-compose.yml          # PostgreSQL 16 + Redis 7
|-- Dockerfile                  # Production image (future)
|-- .env.example                # Environment variable template
|-- package.json
|-- prisma/
|   |-- schema.prisma           # Database schema
|   +-- migrations/             # Auto-generated migrations
|-- public/                     # Static assets
|-- content/                    # Markdown source files (Git-managed)
|   |-- articles/
|   |   |-- zh/                 # Chinese published articles
|   |   |-- en/                 # English published articles
|   |   +-- drafts/             # Draft articles
|   +-- wiki/
|       |-- zh/                 # Chinese wiki entries
|       +-- en/                 # English wiki entries
|-- src/
|   |-- app/
|   |   |-- (public)/           # Public-facing pages
|   |   |   |-- page.tsx        # Homepage
|   |   |   |-- articles/       # Article list/detail
|   |   |   |-- wiki/           # Wiki list/detail
|   |   |   +-- about/
|   |   |-- (dashboard)/        # Admin dashboard
|   |   |   +-- admin/
|   |   |-- api/                # API Routes
|   |   |   |-- articles/
|   |   |   |-- wiki/
|   |   |   |-- ai/
|   |   |   |   |-- review/
|   |   |   |   |-- translate/
|   |   |   |   |-- generate/
|   |   |   |   +-- status/
|   |   |   +-- webhook/
|   |   +-- layout.tsx          # Root layout
|   |-- components/
|   |   |-- ui/                 # shadcn/ui components
|   |   |-- layout/             # Navbar, footer
|   |   |-- article/            # Article components
|   |   |-- wiki/               # Wiki components
|   |   +-- ai/                 # AI chat drawer
|   |-- lib/
|   |   |-- db.ts               # Prisma client singleton
|   |   |-- queue/              # Bull queue
|   |   |   |-- client.ts
|   |   |   |-- producer.ts
|   |   |   |-- consumer.ts
|   |   |   +-- jobs/
|   |   |-- ai/
|   |   |   |-- client.ts       # DeepSeek API wrapper
|   |   |   |-- prompts/        # Prompt templates
|   |   |   +-- parsers.ts
|   |   |-- markdown/
|   |   |   |-- renderer.ts     # Notesaw/Remark renderer
|   |   |   +-- linkDetector.ts # Wiki link detection
|   |   +-- mail.ts             # Resend wrapper
|   |-- types/                  # TypeScript types
|   |   |-- article.ts
|   |   |-- wiki.ts
|   |   +-- ai.ts
|   +-- worker.ts               # Worker entry point
|-- tailwind.config.js
|-- next.config.ts
+-- tsconfig.json
```

### Key Configuration Files
| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js configuration |
| `tsconfig.json` | TypeScript strict mode config |
| `postcss.config.mjs` | PostCSS with Tailwind CSS v4 |
| `eslint.config.mjs` | ESLint flat config with Next.js presets |
| `.prettierrc` | Prettier formatting config |
| `docker-compose.yml` | Dev services (PostgreSQL + Redis) |
| `.env.example` | Required environment variables |

## Development Workflow

### Prerequisites
- **Node.js 20+**
- **Docker** (for PostgreSQL and Redis)
- **npm** (comes with Node.js)

### Quick Start
```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your API keys

# Start PostgreSQL and Redis
docker compose up -d

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
# Visit http://localhost:3000
```

### Available Scripts
| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server (Turbopack) |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run format` | Format all source files with Prettier |
| `npm run format:check` | Check formatting without writing |

### Testing
- **Unit tests**: Co-located with source files as `*.test.ts`
- **Integration tests**: `tests/integration/`
- **E2E tests**: `tests/e2e/` (Playwright, optional)
- **Coverage target**: >= 80% for unit tests, all core APIs for integration tests

### Code Conventions
- TypeScript strict mode (`strict: true`)
- Naming: `camelCase` for variables/functions, `PascalCase` for classes/interfaces, `UPPER_SNAKE_CASE` for constants
- Public functions must have JSDoc comments
- No `any` types -- use `unknown` when necessary
- Use `async/await` for asynchronous code
- Error handling with `try/catch` and logging
- Formatting enforced by Prettier (run `npm run format` before committing)

### Git Workflow
- Branch: work on `dev`, merge to `main` after review
- Commit format: `<type>(<scope>): <subject>`
- Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`
- Commits must include: `Co-Authored-By: Continue <noreply@continue.dev>`

### Common Tasks
- **Adding a shadcn/ui component**: `npx shadcn@latest add <component-name>`
- **Prisma migration**: `npx prisma migrate dev --name <migration-name>`
- **Prisma Studio**: `npx prisma studio`

### Environment Variables
```
DATABASE_URL     - PostgreSQL connection string
REDIS_URL        - Redis connection string
DEEPSEEK_API_KEY - DeepSeek API key
DEEPSEEK_BASE_URL - DeepSeek API base URL
RESEND_API_KEY   - Resend email API key (optional)
ADMIN_PASSWORD   - Dashboard password (MVP)
SITE_NAME        - Site name (default: Miniese's Blog)
SITE_URL         - Site URL for links
```
