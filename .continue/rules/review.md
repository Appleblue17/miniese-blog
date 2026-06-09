---
invokable: true
---

# Code Review Instructions

Review this code for potential issues, including:

## TypeScript / Type Safety
- **Strict mode compliance**: Does the code respect `strict: true` in tsconfig?
- **Avoid `any`**: Are there any uses of `any` that should be `unknown` or a proper type?
- **Proper type exports**: Are shared types defined in `src/types/` and properly imported?
- **Prisma type safety**: Are Prisma queries using proper generated types rather than raw SQL?

## Project Conventions
- **Code style**: Does it follow the project's naming conventions (camelCase for functions/variables, PascalCase for interfaces/types)?
- **JSDoc**: Are public functions documented with JSDoc?
- **Error handling**: Are async operations wrapped in try/catch with proper error logging?
- **No hardcoded values**: Are configuration values (API keys, URLs, prompts) stored in environment variables or config files, not hardcoded?

## Next.js & React Best Practices
- **App Router patterns**: Are Route Handlers, Server Components, and Client Components used appropriately?
- **Data fetching**: Are database queries and API calls properly cached or deduplicated?
- **Performance**: Are there unnecessary re-renders, missing `key` props, or missing `'use client'` directives?
- **Image optimization**: Are `<Image>` components used with proper sizing instead of `<img>` tags?

## AI Integration
- **Prompt management**: Are prompts stored in `lib/ai/prompts/` as templates, not inline in code?
- **Error resilience**: Does the DeepSeek API wrapper have timeout, retry, and rate limiting?
- **Token tracking**: Is token usage being logged for cost monitoring (as required by PRD)?
- **JSON parsing fallback**: Is there graceful handling when AI returns malformed JSON?

## Queue & Worker
- **Task lifecycle**: Do queue tasks properly update `AiTask.status` through pending → processing → completed/failed?
- **Error handling**: Are worker failures retried (max 3 times) and logged?
- **Idempotency**: Can queue tasks be safely retried without side effects?

## Database & Prisma
- **Migrations**: Are schema changes committed as proper Prisma migrations?
- **Query efficiency**: Are there N+1 queries that need `include` or `select` optimization?
- **Validation**: Are inputs validated before database insertion?
- **Singletons**: Is the Prisma client properly implemented as a singleton (preventing hot-reload connections)?

## Markdown Rendering
- **Notesaw compatibility**: Does the renderer handle Notesaw block-nesting syntax in addition to standard Markdown?
- **KaTeX integration**: Are math formulas rendering correctly in both inline and block forms?
- **Wiki link detection**: Are detected terms properly replaced with anchor tags containing `data-wiki` attributes?
- **Security**: Is the rendered HTML sanitized to prevent XSS?

## Testing
- **Coverage**: Are there unit tests for utility functions and integration tests for API endpoints?
- **Edge cases**: Are empty states, error states, and loading states tested?
- **Mocking**: Are external API calls (DeepSeek) properly mocked in tests?

## Documentation
- **Development log**: Is `docs/development-log.md` updated with the task record?
- **Architecture changes**: If the code changes the structure or flow, is `docs/architecture.md` updated?
- **Changelog**: Should `docs/CHANGELOG.md` be updated?

Provide specific, actionable feedback for each issue found, referencing exact file paths and line numbers.
