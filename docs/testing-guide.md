# 测试指南

> **面向开发者**的测试参考文档，包含手动验证方法、当前测试清单和注意事项。
> Agent 应优先参考 `AGENTS.md` 中的"Testing"小节了解规范，再查阅本文档获取具体细节。

## 快速开始

```bash
# 运行所有测试
npm test

# 监听模式（开发时使用）
npm run test:watch

# 带覆盖率报告
npm run test:coverage
```

## 测试框架

- **测试运行器**：Vitest v4
- **断言库**：Vitest 内置（兼容 Jest API，`describe` / `it` / `expect`）
- **覆盖率**：c8 / v8 引擎（通过 `@vitest/coverage-v8`）
- **配置**：`vitest.config.ts`

## 当前测试

### 阶段 2.1：Markdown 渲染器

**文件**：`src/lib/markdown/renderer.test.ts`
**数量**：41 个测试用例

| 测试分组 | 数量 | 说明 |
|----------|------|------|
| 标准 Markdown | 18 | 标题、粗体、斜体、代码块、列表、引用、链接、图片、表格、删除线、任务列表等 |
| KaTeX 数学公式 | 3 | 行内公式 `$...$`、块公式 `$$...$$`、Notesaw 模式下的公式 |
| Notesaw 语法 | 16 | @def block（含/不含标题）、@note inline-block、@[box]、嵌套 block、缩写映射（thm→theorem）、样式修饰符（?!*）、多个 block、标准 Markdown 在 Notesaw 模式下的兼容性、公式在 block 内 |
| 边界情况 | 4 | 空输入、空白输入、单字符、HTML 转义 |

### 覆盖率目标

- 分支（branches）≥ 80%
- 函数（functions）≥ 80%
- 行（lines）≥ 80%
- 当前实际值：**100%**

## 如何手动验证渲染效果

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

## 如何编写新的测试

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

## 注意事项

1. **`renderMarkdown` 是异步函数** — 测试中必须用 `await`
2. **HTML 输出是片段** — 不包含 `<html>`、`<head>`、`<body>` 标签，适合通过 `dangerouslySetInnerHTML` 注入 React 组件
3. **代码高亮暂不可用** — `rehype-starry-night` 存在版本兼容问题，测试和渲染管线中均未包含
4. **测试文件必须用 `.ts` 扩展名** — 因为 `renderer.ts` 中使用的是 `.ts` 扩展名导入 Notesaw 包
