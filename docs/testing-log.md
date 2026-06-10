# 测试记录

> 面向Agent的测试参考记录文档。

### 阶段 3a：发布流程步骤一——上传页

**更新时间**：2026-06-10
**文件**：`tests/integration/articles-publish.test.ts`
**变更**：新增 1 个回归测试修复（slug 保留逻辑）
**总览**：**84/84 全部通过**（单元 57 + 集成 27），0 跳过

| 文件 | 类型 | 数量 | 说明 |
|------|------|------|------|
| `src/lib/articles/frontmatter.test.ts` | 单元测试 | 16 | frontmatter 解析、slug 生成 |
| `src/lib/markdown/renderer.test.ts` | 单元测试 | 41 | Markdown/Notesaw 渲染 |
| `tests/integration/articles-upload.test.ts` | 集成测试 | 4 | 上传 .md 文件到 drafts |
| `tests/integration/articles-preview.test.ts` | 集成测试 | 6 | Markdown/Notesaw 渲染为 HTML |
| `tests/integration/articles-publish.test.ts` | 集成测试 | 5 | 发布草稿（文件移动 + DB 写入） |
| `tests/integration/articles-list.test.ts` | 集成测试 | 8 | 分页列表、tag/lang 筛选 |
| `tests/integration/articles-detail.test.ts` | 集成测试 | 4 | 文章详情 + 渲染 HTML |

### 阶段 2.2：文章基础 CRUD

**更新时间**：2026-06-10
**总览**：**83/83 全部通过**（单元 57 + 集成 26），0 跳过
