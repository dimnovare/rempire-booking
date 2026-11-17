import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // each file starts its own in-memory Postgres (PGlite) and migrates it;
    // with 20 files at once on a busy laptop that set-up can pass 10 s
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
