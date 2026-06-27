import { defineConfig } from "vitest/config";

// Unit tests only — the edition engine (convex/lib/editions.logic.ts) and other PURE helpers.
// These import no Convex runtime (only plain constants), so a plain node environment runs them
// directly with no convex-test harness. Add convex-test + edge-runtime here later if/when a
// function-level integration test is wanted.
export default defineConfig({
  test: {
    include: ["convex/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
