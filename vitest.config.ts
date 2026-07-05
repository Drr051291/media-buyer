import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // "server-only" throws when resolved via its "browser" package.json field,
      // which Vite picks up by default. Next.js special-cases this import;
      // vitest doesn't, so stub it out for unit tests.
      "server-only": path.resolve(__dirname, "./tests/mocks/server-only.ts"),
    },
  },
});
