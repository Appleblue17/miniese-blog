---
invokable: true
---

Review this code for potential issues, including:

## TypeScript / Type Safety
- **Strict mode compliance**: Does the code respect `strict: true` in tsconfig (`@/*` path alias, `noEmit`, `bundler` moduleResolution)?
- **Avoid `any`**: Are there any uses of `any` that should be `unknown` or a proper type? The project bans `any` — use `unknown` with type guards.
- **Proper type exports**: Are shared types defined in `src/types/` (article.ts, wiki.ts, ai.ts, auth.ts) and properly imported?
- **Prisma type safety**: Are Prisma queries using proper generated types from `src/generated/prisma/` rather than raw SQL?
- **JSDoc**: Are public functions documented with JSDoc comments (as required by the project conventions)?

## Project Conventions
- **Code style**: Does it follow the project's naming conventions (camelCase for functions/variables, PascalCase for interfaces/types, UPPER_SNAKE_CASE for constants)?
- **Error handling**: Are async operations wrapped in try/catch with proper error logging using `console.error`?
- **No hardcoded values**: Are configuration values (API keys, URLs, prompts) stored in environment variables or config files, not hardcoded?
- **Prettier compliance**: Does the code follow `.prettierrc` formatting (singleQuote: false, semi: true, trailingComma: all, printWidth: 100)?

## Next.js 16 & React Best Practices
- **App Router patterns**: Are Route Handlers, Server Components, and Client Components used appropriately with proper `"use client"` directives?
- **Proxy middleware**: Is `/proxy.ts` correctly protecting admin routes and handling language redirects?
- **Data fetching**: Are database queries and API calls properly cached or deduplicated?
- **Performance**: Are there unnecessary re-renders, missing `key` props, or missing `'use client'` directives?
- **Image optimization**: Are `<Image>` components used with proper sizing instead of `<img>` tags (especially in public/images/miniese/)?
- **Turbopack compatibility**: Does the code work with Next.js Turbopack (potential issues with `.ts` extension imports, URL-encoded params)?

## AI Integration (DeepSeek API)
- **Prompt management**: Are prompts stored in `config/default-settings.json` or `lib/ai/prompts/` as templates with `{{variable}}` substitution, not inline in code?
- **Error resilience**: Does the DeepSeek API wrapper (`lib/ai/client.ts`) have timeout (60s), retry (3 times with exponential backoff), and rate limiting?
- **Token tracking**: Is token usage being logged for cost monitoring?
- **JSON parsing fallback**: Is there graceful handling when AI returns malformed JSON using `lib/ai/parsers.ts`?
- **SSE streaming**: For chat functionality, is SSE properly handled with incremental delta detection?

## Queue & Worker
- **Task lifecycle**: Do queue tasks properly update `AiTask.status` through `pending → processing → completed/failed`?
- **Error handling**: Are worker failures retried (max 3 times via Bull defaultJobOptions) and logged?
- **Idempotency**: Can queue tasks be safely retried without side effects (file writes, DB updates)?
- **Lazy initialization**: Is Bull queue accessed via `getQueue()` (lazy init), not eagerly imported?

## Database & Prisma 7.x
- **Migrations**: Are schema changes committed as proper Prisma migrations (not raw SQL)?
- **Query efficiency**: Are there N+1 queries that need `include` or `select` optimization?
- **Validation**: Are inputs validated before database insertion (e.g., Zod schemas)?
- **Singletons**: Is the Prisma client properly implemented as a singleton using `globalThis` pattern in `lib/db.ts`?
- **Adapter**: Is `@prisma/adapter-pg` used correctly for the driver adapter pattern in Prisma 7.x?

## Markdown Rendering & Notesaw
- **Notesaw compatibility**: Does the renderer handle Notesaw block-nesting syntax (`parser.ts`) in addition to standard Markdown?
- **KaTeX integration**: Are math formulas rendering correctly in both inline (`$...$`) and block (`$$...$$`) forms?
- **Wiki link detection**: Are detected terms properly replaced with anchor tags containing `data-wiki` attributes via `linkDetector.ts`?
- **Security**: Is the rendered HTML properly sanitized to prevent XSS (rehypeStringify with `allowDangerousHtml: true` is used intentionally for wiki links)?
- **rehype-starry-night**: Is syntax highlighting handled gracefully (known to be pending due to ESM compatibility issues)?

## Incremental Translation & Review Pipeline
- **Diff-based pipeline**: Are `detectChanges()`, `splitRange()`, and `buildContext()` from `translator2.ts` correctly reused between review and translation?
- **Line-level assembly**: Is the `lineToTranslation` mapping correctly built for incremental translation reuse?
- **Frontmatter handling**: Are frontmatter fields (title, summary) properly translated alongside content?
- **Chunk context**: Is surrounding context properly included in AI prompts for chunks?

## Testing
- **Coverage**: Are there unit tests for utility functions and integration tests for API endpoints (aiming for 80%+ coverage)?
- **Edge cases**: Are empty states, error states, and loading states tested? Are diff/translation edge cases covered (empty content, single-line changes, code blocks)?
- **Mocking**: Are external API calls (DeepSeek) properly mocked in tests?
- **Integration test patterns**: Are integration tests checking DB availability with top-level `await` pattern in `tests/integration/setup.ts`?
- **Component tests**: Are React components using `@testing-library/react` with jsdom environment and `fileParallelism: false`?

## Wiki & Discovery System
- **Wiki lifecycle**: Does code handle all WikiStatus states correctly (creating → unreviewed → reviewed → deleted)?
- **Discovery deduplication**: Are duplicate discoveries prevented (unique constraint on `[articleId, term]` + `filterPendingProposals` check)?
- **Undo operations**: Do undo endpoints correctly roll back file and DB changes?
- **Term definition language**: Are AI-generated definitions using the correct language matching the article language?

## Authentication & Authorization
- **NextAuth v5**: Are providers, callbacks, and session callbacks correctly configured in `src/auth.ts`?
- **Admin protection**: Is the proxy middleware correctly protecting admin routes and APIs?
- **Password handling**: Are passwords hashed with bcrypt before storage?
- **Session management**: Is JWT session strategy used correctly? Are session tokens refreshed properly?

## Documentation
- **Development log**: Is `docs/development-log.md` updated with the task record (date, status, changes, test results, issues)?
- **Architecture changes**: If the code changes the structure or flow, is `docs/architecture.md` updated?
- **Changelog**: Should `docs/CHANGELOG.md` be updated?
- **PRD syncing**: If the change affects product requirements, is `docs/PRD.md` updated?

Provide specific, actionable feedback for each issue found, referencing exact file paths and line numbers.
