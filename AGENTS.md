# AGENTS.md — Miniese's Blog

## Project Description

**Miniese's Blog** is a personal blog + knowledge base system with an integrated AI assistant named Miniese. It targets technical content creators who want a unified platform for writing, knowledge management, and AI-powered content assistance.

### Main Purpose & Goals
- Provide a rich blog publishing platform supporting **Markdown** and the custom **Notesaw** syntax
- Maintain a wiki/knowledge base with automatic article-to-term linking (bidirectional links)
- Integrate an **AI assistant (Miniese)** for article review, translation, changelog generation, term discovery (scanning articles to find new wiki candidates), term generation (auto-writing wiki entries), and reader Q&A
- Support **multi-language** content (Chinese/English) with incremental AI translation (line-level diff-based)
- Offer a **dashboard** for the admin to manage articles, wiki entries, AI proposals, notifications, and site settings
- Enable **reader interaction** through comments, AI chat (SSE streaming), and term-suggestion requests
- Provide customizable appearance with Hero section, background images, theme colors, and dark/light mode

### Key Technologies
| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | **Next.js 16** (App Router) | Full-stack, SSR/SSG, Turbopack |
| Language | **TypeScript 5** | Strict mode enabled |
| Styling | **Tailwind CSS 4** | Utility-first CSS, `@tailwindcss/postcss` |
| UI Components | **shadcn/ui** (base-nova style) | Neutral theme, lucide-react icons |
| Database | **PostgreSQL 16** via Docker | Prisma 7.x ORM with `@prisma/adapter-pg` |
| Queue | **Bull** + **Redis 7** | Async AI task processing (review, translate, discover, generate) |
| AI Integration | **DeepSeek API** | Changelog, review, translation, term discovery & generation, chat |
| Auth | **NextAuth.js v5** | Credentials + optional Google/GitHub OAuth, JWT sessions |
| Email | **Resend SDK** | Notifications, email verification, password reset |
| Markdown | **unified/remark/rehype** | KaTeX, GFM, starry-night (pending), rehype-slug |
| Custom Parser | **Notesaw** (`@miniese/notesaw`) | Custom block-nesting syntax built on unified/hast |
| Containerization | **Docker Compose** | Dev: PostgreSQL 16 + Redis 7 |
| Testing | **Vitest v4** | Supertest for integration tests, jsdom + @testing-library/react for component tests |

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
                   | creates job (addJob)
                   v
+---------------------------------------+
|        Redis Queue (Bull)              |
|   ai-tasks queue                      |
+------------------+--------------------+
                   | consumes
+------------------+--------------------+
|         Worker Process                 |
|   npm run worker: tsx src/worker.ts   |
|   AI Review / AI Translation          |
|   AI Term Discovery / Generate        |
+------------------+--------------------+
                   | updates DB + FS
+------------------+--------------------+
|          PostgreSQL (Prisma)           |
|          + File System (content/)      |
+---------------------------------------+
```

### Main Components & Relationships
| Component | Responsibility | Communication |
|-----------|---------------|---------------|
| **Next.js App** | Page rendering, short API tasks (list, CRUD, chat) | Direct DB queries via Prisma |
| **Redis Queue (Bull)** | Store long-running AI tasks | Producer (`addJob`) creates jobs, Worker consumes |
| **Worker** | Separate Node process (`src/worker.ts`) consuming queue tasks | Calls DeepSeek API, writes results to DB + file system |
| **PostgreSQL (Prisma 7.x)** | Primary data store; Prisma client generated to `src/generated/prisma/` | Prisma ORM with driver adapter `@prisma/adapter-pg` |
| **File System** | Store Markdown source files in `content/` directory | Git-managed, read/written by API routes and worker |
| **DeepSeek API** | AI model for all AI features | HTTP calls with retry, timeout, JSON mode |
| **Redis** | Queue backend and rate-limiting data | Direct connection from Bull queue |

### Data Flow
1. **Short request** (e.g., list articles, CRUD, chat): Next.js API Route → direct DB query → response
2. **Long AI task** (e.g., review, translate, discover): Next.js API Route → `addJob()` → Bull queue → Worker picks up → calls DeepSeek API → updates DB + writes files
3. **Frontend** polls task status or receives SSE stream (chat)
4. **Article rendering pipeline**: Markdown/Notesaw source → unified/remark/rehype pipeline → HTML with wiki links injected → cached as `renderedContent` in DB
5. **Incremental AI**: Translation and review use shared diff-based pipeline: `detectChanges()` → `splitRange()` → `buildContext()` → AI → merge

### Key Architectural Decisions
- **Incremental diff-based pipeline** for both review and translation (shared `detectChanges`/`splitRange`/`buildContext` in translator2.ts)
- **Feature flags** via `config/settings.ts` — features like aiReview, autoTranslate, wikiDiscovery can be toggled
- **Custom prompts** stored in DB settings, loaded by `promptLoader.ts` with `{{variable}}` placeholder substitution
- **Lazy queue initialization** — Bull queue created on first use, safe to import in test environments without Redis

## Directory Structure

```
miniese-blog/
|-- docker-compose.yml          # PostgreSQL 16 + Redis 7
|-- .env.example                # Environment variable template
|-- package.json
|-- tsconfig.json               # TypeScript strict mode
|-- vitest.config.ts            # Vitest test configuration
|-- components.json             # shadcn/ui configuration
|-- prisma/
|   |-- schema.prisma           # Database schema (all models + enums)
|   +-- migrations/             # Auto-generated Prisma migrations
|-- config/
|   |-- settings.ts             # Settings loading, merging, caching
|   |-- default-settings.json   # Default site settings (prompts, appearance, features)
|   +-- custom-settings.json    # User overrides (gitignored)
|-- content/                    # Markdown source files (Git-managed)
|   |-- articles/
|   |   |-- zh/                 # Chinese published articles
|   |   |-- en/                 # English published articles
|   |   +-- drafts/             # Draft articles
|   +-- wiki/
|       |-- zh/                 # Chinese wiki entries
|       +-- en/                 # English wiki entries
|-- public/                     # Static assets
|   |-- images/miniese/         # Miniese avatar, hero images, backgrounds
|   |-- styles/                 # CSS: github-markdown.css, note.css, katex.min.css
|   +-- icon/                   # Feather SVG sprite for Notesaw
|-- packages/
|   +-- notesaw/                # @miniese/notesaw: custom Notesaw parser
|       |-- parser.ts           # Unified parser (Markdown superset with block nesting)
|       |-- transformer.ts      # HAST transformer
|       +-- index.ts            # Package entry
|-- src/
|   |-- app/
|   |   |-- (public)/           # Public-facing pages
|   |   |   |-- page.tsx        # Homepage (Hero + content sections)
|   |   |   |-- [lang]/         # Language-prefixed routes (articles, wiki, about)
|   |   |   |   |-- page.tsx    # Language-specific homepage
|   |   |   |   |-- articles/   # Article list + detail
|   |   |   |   +-- wiki/       # Wiki list + detail
|   |   |   +-- login/          # Login page
|   |   |   +-- register/       # Registration
|   |   |   +-- settings/       # User settings
|   |   |   +-- forgot/         # Forgot password
|   |   |   +-- reset/          # Password reset
|   |   |   +-- verify/         # Email verification
|   |   |-- (dashboard)/        # Admin dashboard
|   |   |   +-- admin/          # Article management, wiki management, AI tasks, settings
|   |   |-- api/                # API Routes
|   |   |   |-- articles/       # Upload, publish, preview, list, detail, delete, create-draft, render
|   |   |   |-- wiki/           # Wiki CRUD, undo, proposals
|   |   |   |-- comments/       # Comment CRUD
|   |   |   |-- chat/           # SSE streaming chat
|   |   |   |-- tags/           # Tag listing
|   |   |   +-- admin/          # Admin-specific APIs (ai-tasks, settings, media, notifications)
|   |   +-- layout.tsx          # Root layout with theme, global styles
|   |-- components/
|   |   |-- ui/                 # shadcn/ui components (button, card, badge, label, select, etc.)
|   |   |-- layout/             # Navbar (sidebar), ActionBar (top-right), Footer
|   |   |-- article/            # ArticleCard, ArticleList, ArticleReader, TableOfContents, CommentSection, etc.
|   |   |-- wiki/               # WikiCard, WikiList, WikiReader, WikiPreview (hover)
|   |   |-- admin/              # PublishForm, FileUploader, AdminWikiList, ImageManager, etc.
|   |   |-- ai/                 # ChatButton, ChatDrawer, TextSelectionToolbar
|   |   |-- home/               # HeroSection, HeroCarousel, LatestArticles, PopularArticles, ActivityTimeline
|   |   +-- theme/              # ThemeProvider, ThemeToggle, ThemeInitScript
|   |-- lib/
|   |   |-- db.ts               # Prisma client singleton (PrismaPg adapter)
|   |   |-- auth.ts             # NextAuth v5 configuration
|   |   |-- mail.ts             # Resend SDK wrapper (mock in dev mode)
|   |   |-- notifications.ts    # Notification creation + email dispatch
|   |   |-- diff.ts             # Text diff utilities
|   |   |-- utils.ts            # General utilities (cn, etc.)
|   |   |-- queue/
|   |   |   |-- client.ts       # Bull queue lazy initialization
|   |   |   +-- producer.ts     # addJob() — create DB record + enqueue
|   |   |-- ai/
|   |   |   |-- client.ts       # DeepSeek API wrapper (retry, timeout, token tracking)
|   |   |   |-- promptLoader.ts # Load custom prompts from DB settings
|   |   |   |-- reviewer.ts     # Incremental review pipeline
|   |   |   |-- translator2.ts  # Incremental translation pipeline (line-level diff)
|   |   |   |-- discovery.ts    # Wiki term discovery from articles
|   |   |   |-- generator.ts    # AI wiki entry generation
|   |   |   |-- parsers.ts      # JSON parsing with fallback
|   |   |   |-- refineTerm.ts   # Term name refinement
|   |   |   |-- chunker/        # Article chunking utilities
|   |   |   +-- prompts/        # Default prompt templates (review, translate, discovery, generate)
|   |   |-- markdown/
|   |   |   |-- renderer.ts     # Unified renderer (markdown + notesaw pipelines)
|   |   |   |-- linkDetector.ts # Wiki link detection and injection
|   |   |   +-- client-render.ts # Client-side rendering
|   |   |-- articles/
|   |   |   |-- frontmatter.ts  # Frontmatter parse/build utilities
|   |   |   +-- images.ts       # Image processing
|   |   +-- wiki/
|   |       +-- parser.ts       # Wiki entry content parser (block extraction)
|   |-- types/
|   |   |-- article.ts          # ArticleMeta type
|   |   |-- wiki.ts             # Wiki entry types (WikiStatus, WikiEntryMeta, etc.)
|   |   |-- ai.ts               # AI types (AiTaskType, ReviewReport, SelectionInfo, etc.)
|   |   +-- auth.ts             # Auth types (SessionUser, UserRole, etc.)
|   |-- auth.ts                 # NextAuth configuration (providers, callbacks)
|   |-- proxy.ts                # Next.js 16 proxy middleware (auth + language redirect)
|   +-- worker.ts               # Worker entry point (processReview, processTranslate, etc.)
|-- scripts/
|   +-- create-admin.ts         # Admin user creation script
|-- tests/
|   +-- integration/            # Integration tests (Supertest + DB)
|       |-- setup.ts            # Test setup (DB check, etc.)
|       |-- helpers.ts          # Test helpers
|       |-- articles-upload.test.ts
|       |-- articles-detail.test.ts
|       |-- articles-render.test.ts
|       |-- wiki-crud.test.ts
|       |-- wiki-proposals.test.ts
|       +-- queue.test.ts
|-- docs/                       # Project documentation
|   |-- PRD.md                  # Product requirements
|   |-- architecture.md         # Technical architecture
|   |-- MVP.md                  # MVP scope definition
|   |-- development-order.md    # Task ordering
|   |-- development-log.md      # Development activity log
|   |-- agent-workflow.md       # Agent workflow specification
|   |-- user-guide.md           # User guide
|   +-- testing-log.md          # Testing notes
|-- config/settings.ts          # Settings loading/merging logic
|-- next.config.ts              # Next.js configuration
|-- eslint.config.mjs           # ESLint flat config (Next.js + Prettier)
|-- postcss.config.mjs          # PostCSS with Tailwind CSS v4
+-- .prettierrc                 # Prettier configuration
```

### Key Configuration Files
| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js configuration |
| `tsconfig.json` | TypeScript strict mode with `@/*` path alias |
| `postcss.config.mjs` | PostCSS with Tailwind CSS v4 |
| `eslint.config.mjs` | ESLint flat config with Next.js + Prettier |
| `.prettierrc` | Prettier formatting (singleQuote: false, semi: true, trailingComma: all) |
| `docker-compose.yml` | Dev services (PostgreSQL 16 + Redis 7) |
| `.env.example` | Required environment variables |
| `config/default-settings.json` | Default site settings (prompts, appearance, features, notifications) |
| `config/settings.ts` | Settings loading/merging/caching logic |
| `vitest.config.ts` | Vitest config with coverage thresholds (80% lines/branches/functions) |

### Database Schema (Prisma 7.x)
Key models: `Article`, `WikiEntry`, `ArticleWikiLink`, `AiTask`, `Comment`, `User`, `Account`, `Session`, `WikiDiscovery`, `WikiProposal`, `Notification`, `ArticleImageOverride`

Enums: `ArticleLanguage` (zh/en), `ContentFormat` (markdown/notesaw), `ArticleStatus` (draft/published/review), `AiTaskType` (review/translate/generate/scan/discover), `WikiStatus` (creating/unreviewed/reviewed/deleted), `DiscoveryStatus` (pending/approved/rejected/generated/failed), `ProposalStatus` (pending/approved/rejected)

## Development Workflow

### Working Principles

#### 1. Step-by-step Execution (from agent-workflow.md)
- Each task must be broken down into small steps (create file → write test → implement → verify)
- **After each step, pause and report** — wait for user confirmation before proceeding
- Do NOT complete an entire task in one go

#### 2. Stop on Blockers
- Encounter any error, problem, or ambiguity? **Stop immediately**
- Describe to the user: what happened, what you tried, where you're stuck
- Wait for instructions before proceeding

#### 3. Ask When Unsure
- If PRD or architecture docs are unclear about an implementation detail
- If two documents contradict each other
- If a feature lacks clear acceptance criteria
- **Ask first. Do NOT assume.**

#### 4. Documentation First
- Update docs before modifying code
- All changes recorded in `docs/development-log.md`
- Test-driven: write tests before (or alongside) implementation

### Prerequisites
- **Node.js 20+**
- **Docker** (for PostgreSQL 16 and Redis 7)
- **npm** (comes with Node.js)

### Quick Start
```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your API keys (DEEPSEEK_API_KEY required)

# Start PostgreSQL and Redis
docker compose up -d

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
# Visit http://localhost:3000

# In a separate terminal, start the worker for AI tasks
npm run worker
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
| `npm run test` | Run all tests (vitest run) |
| `npm run test:watch` | Watch mode for development |
| `npm run test:coverage` | With coverage report |
| `npm run worker` | Start AI queue worker (`tsx src/worker.ts`) |
| `npm run create-admin` | Create admin user (`tsx scripts/create-admin.ts`) |

### Testing

**Test Framework**: Vitest v4 with `@vitest/coverage-v8`
**Integration Testing**: Supertest for API endpoints

#### Running Tests
```bash
npm test            # Run all tests (vitest run)
npm run test:watch  # Watch mode for development
npm run test:coverage  # With coverage report
```

#### Test Types & Locations
| Type | Location | Convention |
|------|----------|-----------|
| Unit tests | Co-located as `*.test.ts` next to source files | One test file per module |
| Integration tests | `tests/integration/` | Core APIs covered via Supertest (+ DB) |
| Component tests | Co-located as `*.test.tsx` (e.g., `WikiPreview.test.tsx`) | jsdom + @testing-library/react |

#### Coverage Target
- Lines: ≥ 80%
- Branches: ≥ 80%
- Functions: ≥ 80%
- Integration tests: all core APIs covered

#### Writing Tests
```typescript
import { describe, it, expect } from "vitest";

describe("Module name", () => {
  it("describes specific behavior", async () => {
    const result = await someFunction();
    expect(result).toContain("expected string");
  });
});
```

Common assertions: `.toContain()`, `.toBe()`, `.not.toContain()`, `.toMatch(/regex/)`, `.toHaveLength(n)`

#### Key Testing Patterns
- `renderMarkdown` is **async** — always `await`
- Rendering output is an HTML **fragment** (no `<html>/<head>/<body>` wrapper)
- Test files use `.ts` extension (not `.tsx`) unless they use React/JSX
- Integration tests check DB availability with `beforeAll` / top-level `await`
- `fileParallelism: false` in vitest config to prevent global state pollution

### Code Conventions
- TypeScript strict mode (`strict: true`)
- Naming: `camelCase` for variables/functions, `PascalCase` for classes/interfaces, `UPPER_SNAKE_CASE` for constants
- Public functions must have JSDoc comments
- No `any` types — use `unknown` when necessary
- Use `async/await` for asynchronous code
- Error handling with `try/catch` and logging (`console.error`)
- Formatting enforced by Prettier (run `npm run format` before committing)
- Path alias `@/*` maps to `./src/*`

### Git Workflow
- Branch: work on `dev`, merge to `main` after review
- Commit format: `<type>(<scope>): <subject>`
- Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`
- Commits must include co-author: `Co-Authored-By: Continue <noreply@continue.dev>`

### Common Tasks
- **Adding a shadcn/ui component**: `npx shadcn@latest add <component-name>`
- **Prisma migration**: `npx prisma migrate dev --name <migration-name>`
- **Prisma Studio**: `npx prisma studio`
- **Create admin user**: `npm run create-admin`
- **Start worker**: `npm run worker`
- **Update Prisma client after schema change**: `npx prisma generate`

### Environment Variables
```
DATABASE_URL          - PostgreSQL connection string (default: postgresql://dev:devpass@localhost:5432/miniese)
REDIS_URL             - Redis connection string
DEEPSEEK_API_KEY      - DeepSeek API key (required for AI features)
DEEPSEEK_BASE_URL     - DeepSeek API base URL (default: https://api.deepseek.com)
NEXTAUTH_SECRET       - NextAuth session secret
NEXTAUTH_URL          - NextAuth site URL (default: http://localhost:3000)
RESEND_API_KEY        - Resend email API key (optional)
GOOGLE_CLIENT_ID      - Google OAuth client ID (optional)
GOOGLE_CLIENT_SECRET  - Google OAuth client secret (optional)
GITHUB_CLIENT_ID      - GitHub OAuth client ID (optional)
GITHUB_CLIENT_SECRET  - GitHub OAuth client secret (optional)
SITE_URL              - Site URL for links (default: http://localhost:3000)
```

### Key Technology Details

#### Markdown/Nodesaw Rendering
- Uses `unified` pipeline: `remark-parse` → `remark-gfm` → `remark-math` → `rehype-starry-night` (pending) → `rehype-katex` → `rehype-slug` → `rehype-stringify`
- Notesaw adds a custom parser (`packages/notesaw/parser.ts`) that extends Markdown with block-nesting syntax
- Two pipelines: one for standard Markdown, one for Notesaw (pre-prends Notesaw parse step)

#### Wiki Link System
- `linkDetector.ts`: scans rendered HTML for wiki terms, injects `<a data-wiki="term">` tags
- `WikiPreview.tsx`: client-side component, 300ms hover delay, 5-min global cache, event delegation
- Links cached in `renderedContent` at publish time; manual "refresh links" button in admin
- Reverse links: wiki entry pages show articles that reference the term

#### AI Task Queue
- Short-lived tasks (chat): direct SSE streaming via `/api/chat`
- Long-running tasks (review, translate, discover, generate): Bull queue with Redis
- Worker (`src/worker.ts`) processes 5 job types: `processReview`, `processTranslate`, `processDiscover`, `processGenerate`, `processScan`
- Tasks auto-retry 3 times with exponential backoff
- Status tracked in `AiTask` table: `pending → processing → completed/failed`

#### Prompt Customization
- Default prompts in `config/default-settings.json` under `prompts` key
- Custom prompts stored in `config/custom-settings.json` via settings UI
- `promptLoader.ts`: loads custom prompt, falls back to default, supports `{{variable}}` substitution
- Supported variables: `{{content}}`, `{{term}}`, `{{sourceLang}}`, `{{targetLang}}`, `{{context}}`, etc.

#### Authentication & Authorization
- NextAuth.js v5 with Credentials (email + bcrypt password) + optional Google/GitHub OAuth
- JWT session strategy
- Roles: `admin` and `user` (stored as string array on User model)
- Admin routes protected via `proxy.ts` middleware
- Non-admin users register via `/register`, login via `/login`

#### Notifications
- Database-backed notifications (Notification model)
- Email sending via Resend (mocked in dev mode unless `features.realEmail: true`)
- Notification types: `comment`, `comment_deleted`, `translation_complete`, `task_failed`, `discovery`
- Admin email notifications for important events

#### Site Settings
- Two-file system: `default-settings.json` + `custom-settings.json` (overlay)
- `config/settings.ts`: loading, deep merging, 5-second cache, live update via `clearSettingsCache()`
- Settings categories: site info, appearance (colors, backgrounds, themes), features (toggles), notifications, compilers, prompts
- Appearance settings exposed as CSS variables for runtime theme switching

## Config/Documentation Summary

| Doc | Purpose | Required Reading |
|-----|---------|-----------------|
| `docs/PRD.md` | Full product requirements | Before implementing features |
| `docs/architecture.md` | Technical architecture | Before making structural changes |
| `docs/MVP.md` | MVP scope and priorities | Understanding what's in/out of scope |
| `docs/development-order.md` | Task ordering and dependencies | Understanding task sequencing |
| `docs/agent-workflow.md` | Agent workflow specifications | Following the development process |
| `docs/development-log.md` | Development activity log | Updating after each task |
| `docs/user-guide.md` | User-facing documentation | Reference for user-facing features |
| `config/settings.ts` | Settings loading logic | Understanding configuration system |
| `prisma/schema.prisma` | Database schema | Before any DB changes |
