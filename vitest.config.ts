import { defineConfig } from "vitest/config";
import path from "node:path";

// Config de teste espelhando o vite.config.ts: mesmo alias `@` e plugins de React.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "workers/**/*.test.ts", "supabase/functions/**/*.test.ts"],
  },
});