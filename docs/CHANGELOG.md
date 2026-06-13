# Changelog

> 记录项目的重要变更。格式基于 [Keep a Changelog](https://keepachangelog.com/)。

## [Unreleased]

### Added
- **AI Prompt 自定义管道**: 站点设置中的 prompt 模板现在实际应用到 AI 调用中。
  - `promptLoader.ts` — `loadCustomPrompt(key)` 从设置 DB 读取自定义 prompt
  - `reviwer.ts`/`translator2.ts`/`discovery.ts`/`generator.ts` — 各自函数接受可选 `customPrompt` 参数
  - `worker.ts` — 全部 4 个 handler 调用 `loadCustomPrompt(key)` 并传入自定义 prompt
  - `prompts/review.ts` — `buildReviewPrompt()`/`buildReviewPromptWithContext()` 接受 `customPrompt`
  - `translator2.ts` — `buildChunkPrompt()` 支持 `{{sourceLang}}/{{targetLang}}/{{context}}/{{target}}` 占位符
  - `discovery.ts` — 支持 `{{content}}` 占位符
  - `generator.ts` — 支持 `{{term}}/{{definitionHint}}/{{context}}` 占位符
- **设置页"恢复默认"按钮**: 所有设置字段旁添加一键恢复默认的按钮。
  - 新增 `DEFAULT_SETTINGS` 常量和 `ResetButton` 组件
  - 常规/外观/功能开关/通知/高级 共 5 个 tab 全部字段支持恢复默认
  - 4 组色相/饱和度/明度滑块的"恢复默认"按钮，各自仅重置对应模式（浅色/深色）的三个值，保留另一模式的值

### Fixed
- **预览明度不更新**: 调整明度滑块时右侧实时预览的标题/链接/按钮颜色未同步更新。
  - 根因：预览区硬编码了明度值（`55%`/`75%`），未使用 CSS 变量
  - 修复：预览区所有颜色引用改为 `var(--primary-lightness)` 和 `var(--accent-lightness)`

### Fixed
- **详情页「暂无定义」**: `processDiscover()` 返回的 `candidates` 缺少 `definition` 字段。修复：在 `candidates.map()` 加入 `definition: c.definition`
- **重复词条**: `WikiDiscovery` 表缺少 `@@unique([articleId, term])` 约束；`filterPendingProposals()` 只检查 `pending` 状态。修复：添加唯一约束 + 迁移，改为检查所有状态
- **英文术语中文解释**: discovery prompt 未指定 definition 语言。修复：在 system/user prompt 中明确要求 language consistency
- **增量审查不工作**: 草稿的 `AiTask` 记录关联草稿 articleId，发布后创建新文章导致找不到 `contentSnapshot`。修复：`processReview` 中使用 `draftOfId` 解析查找已发布文章的审查记录
- **草稿记录未删除**: 发布后使用 `update` 而非 `delete`，导致孤立草稿记录。修复：迁移 AiTask 后执行 `prisma.article.delete()`
- **新文章流程孤立草稿**: 审查自动创建草稿后用户留在上传页，点击发布导致草稿被孤立。修复：审查按钮移至草稿编辑页（步骤二），上传页仅保留存草稿和下一步按钮
- **刷新后审查状态丢失**: 页面刷新后 `reviewSubmitted` 未恢复，按钮显示"交给助手审查"而非"已提交审查"。修复：在 `useEffect` 恢复状态时添加 `setReviewSubmitted(true)`
- **translator2.ts Bug 修复**:
  - `reusedCount = 0` → 增加 `lineToTranslation` 映射，支持跨 key 子串搜索
  - 详情页 `buildTranslatedText` 找不到翻译 → 跨 key 子串搜索 fallback
  - 所有非 target chunks 标记为 context → 移除 context 标记逻辑
  - `stripFrontmatter` vs `matter(content).content` 前导换行不一致 → 统一用 `stripFrontmatter`

### Changed
- **翻译 API 路由 (`POST /api/ai/translate`)**: 更新请求参数，接收 `oldSourceContent` 用于增量 diff
- **翻译详情页重写**: 从旧的 `buildTranslatedText` 逻辑改为增量/全量双模式展示
- **`TranslateChunkList.tsx`**: 上下文嵌入到每个 chunk card 内，移除统计提示和 filter 下拉菜单

## [0.8.1] - 2026-06-12
<!-- placeholder -->

## [0.8.0] - 2026-06-12
<!-- placeholder -->
