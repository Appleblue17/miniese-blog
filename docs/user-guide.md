# 用户指南

> **面向开发者/用户**的测试参考文档，包含运行批量测试，重置服务器等操作方式或接口调用方式。

## 测试指南

```bash
# 运行所有测试
npm test

# 监听模式（开发时使用）
npm run test:watch

# 带覆盖率报告
npm run test:coverage
```

### 测试框架

- **测试运行器**：Vitest v4
- **断言库**：Vitest 内置（兼容 Jest API，`describe` / `it` / `expect`）
- **覆盖率**：c8 / v8 引擎（通过 `@vitest/coverage-v8`）
- **配置**：`vitest.config.ts`

### 如何手动验证渲染效果

如果需要手动查看渲染输出，可以使用以下方法：

创建 `scripts/manual-test.mjs`：

```javascript
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";

const html = await unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeKatex)
  .use(rehypeStringify)
  .process("# Hello\n\n$E=mc^2$");

console.log(String(html));
```

运行：
```bash
node scripts/manual-test.mjs
```

### 如何编写新的测试

1. **单元测试**：与源文件同目录，命名为 `*.test.ts`
2. **集成测试**：放在 `tests/integration/`
3. **测试模板**：

```typescript
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./renderer";

describe("功能分组", () => {
  it("描述具体行为", async () => {
    const html = await renderMarkdown("# Title", "markdown");
    expect(html).toContain("<h1>Title</h1>");
  });
});
```

## 清理数据库与文件系统

开发过程中经常需要清理测试数据，让系统回到干净状态。

### 清理方法

```bash
# 1. 清空数据库表
npx prisma db execute --stdin <<< "DELETE FROM \"Article\";"

# 2. 删除文件系统中的 Markdown 源文件
find content/articles -name "*.md" -delete
```

### 原理解释

| 存储层 | 说明 | 清理方式 |
|-------|------|---------|
| **PostgreSQL 数据库** | 存储文章的元信息（标题、slug、状态、路径等） | `DELETE FROM "Article"` |
| **文件系统** (`content/articles/`) | 存储实际的 .md 源文件 | `find ... -delete` |

两者是**独立**的——删文件不会清 DB，删 DB 不会删文件。如果只做其中一项，页面上看到的结果会和实际不符：

- **只删文件，不清 DB** → 仪表盘仍然显示文章列表，但点击编辑/查看时 404（文件已不存在）
- **只清 DB，不删文件** → 仪表盘显示为空，但文件仍占用磁盘空间

### FAQ

**Q: 仪表盘显示有文章，但文件系统里找不到对应的 .md 文件？**
A: DB 记录还在但文件被删了。先执行 `DELETE FROM "Article"` 清 DB，或者重新走上传流程重建文件。

**Q: 为什么我删了 content/ 下的文件，页面还能看到文章？**
A: 页面（仪表盘列表）从 DB 读取数据，不从文件系统。需要同时清理 DB。

**Q: 有没有一键重置的方法？**
A: 把两个命令一起执行即可：

```bash
npx prisma db execute --stdin <<< "DELETE FROM \"Article\";"
find content/articles -name "*.md" -delete
echo "数据库和文件已清空"
```
