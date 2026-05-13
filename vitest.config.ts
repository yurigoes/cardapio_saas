import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include:     ["tests/unit/**/*.test.ts"],
    exclude:     ["node_modules", ".next", "tests/e2e"],
    globals:     true,
    coverage: {
      provider: "v8",
      include:  ["src/lib/**/*.ts"],
      exclude:  ["**/*.d.ts", "**/index.ts"],
    },
  },
});
