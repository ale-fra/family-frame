import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// One project per test type (folder under test/). Run one type with `npm run test:<type>`,
// or everything with `npm test`. See "Tests" in README.md.
export const testProjects = {
  unit: "Pure logic, no I/O: validation, recurrence, display rules, OpenAPI document checks",
  integration: "Real SQLite databases and local services: stores, notifier, webhook delivery",
  api: "HTTP through the Express app in-process: endpoints, authentication, Swagger, contract checks",
  ui: "React components in jsdom: frame schedule stage, admin routines",
  e2e: "Real node processes: server startup and token and timer command lines"
} as const;

export default mergeConfig(viteConfig, defineConfig({
  test: {
    projects: Object.keys(testProjects).map((name) => ({
      extends: true,
      test: name === "ui"
        ? { name, include: ["test/ui/**/*.test.{ts,tsx}"], environment: "jsdom", setupFiles: ["test/helpers/ui-setup.ts"] }
        // e2e files start real node processes: run them one at a time (less load on the other projects running
        // alongside) and allow more than the default 5 s per test.
        : { name, include: [
            `test/${name}/**/*.test.{ts,mjs}`,
            ...(name === "integration" ? ["scripts/export-code-behaviors.test.mjs"] : [])
          ], ...(name === "e2e" ? { testTimeout: 30_000, fileParallelism: false } : {}) }
    }))
  }
}));
