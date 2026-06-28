import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    fileParallelism: false,
    server: {
      deps: {
        inline: ["next"],
      },
    },
    env: {
      DATABASE_URL: process.env.DATABASE_URL || "postgresql://dev:devpass@localhost:5432/miniese",
      REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
    },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/markdown/**/*.ts", "src/lib/articles/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
