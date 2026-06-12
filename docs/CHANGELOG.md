# Changelog

> 记录项目的重要变更。格式基于 [Keep a Changelog](https://keepachangelog.com/)。

## [Unreleased]

### Added
- **翻译引擎重构 (translator2.ts)**: 纯行级 diff 管道的增量翻译引擎。
  - `detectChanges()` — 基于 Myers diff 的行级变化检测，支持相邻合并
  - `splitRange()` — 按标题边界拆分 diff 块为子 chunk
  - `buildContext()` — 上下文窗口构建，向最近标题边界靠拢
  - `incrementalTranslate()` — 主流程：diff → splitRange → context → AI call → assembly
  - `translateFull()` — 全量翻译委托给 `incrementalTranslate("", ...)` 的封装
  - 25 个单元测试覆盖全量/增量/边际情况
- **翻译详情页 (`/admin/ai-tasks/[taskId]`)**: 支持翻译类型任务的输出展示。
  - 增量模式：每个 `translatedGroups[i]` 显示为一个 target chunk card
  - 上下文（aboveContext/belowContext）嵌入到 card 内部，字号 `text-[11px]`
  - 全局上下文显示/隐藏按钮（右上角 Eye/EyeOff 图标）
  - 全量模式：整个文章作为一个 chunk 显示
- **Worker 翻译处理**: `processTranslate` 完整实现增量翻译流水线。
  - 从最新已完成任务加载 `existingTranslations`
  - Frontmatter 元数据翻译（title, summary）
  - 译文写入目标语言文件 + 更新 DB 记录 + HTML 重新渲染

### Fixed
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
