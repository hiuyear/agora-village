import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    // resolve the `@/…` alias from tsconfig.json in tests too, so a test can
    // `import { computeMetrics } from "@/lib/metrics"` just like app code.
    tsconfigPaths: true,
  },
  test: {
    // pure-logic unit tests: no browser/DOM needed, so the fast "node" environment.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
