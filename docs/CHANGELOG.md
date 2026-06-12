# Changelog

> 记录项目的重要变更。格式基于 [Keep a Changelog](https://keepachangelog.com/)。

## [Unreleased]

### Added
- **Wiki 词条发现引擎**: 扫描文章内容自动提取候选词条（`discoverWikiCandidates()`）
  - 统一 chunking pipeline（splitArticle），长文章分块处理
  - 三层去重：AI 响应内去重、已有 WikiEntry 过滤、已有 WikiDiscovery 过滤
  - `processDiscover` worker handler — 读取文章 → AI 扫描 → 写入 `WikiDiscovery` 表
  - 10 个单元测试 + 14 个集成测试
- **翻译后自动词条发现**: `processTranslate` 完成后对译文文章自动触发 `addJob("discover", ...)`（fire-and-forget）
- **发现提案列表页**: `/admin/wiki/discoveries/` — 词条发现提案列表，支持批量操作
- **用户指南**: 新增「重启 Worker」和「清空知识库」操作说明到 `docs/user-guide.md`
- **审查引擎重构 (reviewer.ts)**: 迁移到统一增量 pipeline，与 translator2 架构一致。
  - `incrementalReview()` 复用 `detectChanges` + `splitRange` + `buildContext`
  - 21 个 reviewer 单元测试 + 2 个 roundtrip 测试
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
