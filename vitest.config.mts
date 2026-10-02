import { defineConfig } from "vitest/config";
import path from "node:path";
import "dotenv/config";
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve("src"), "server-only": path.resolve("tests/server-only.ts") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    env: {
      DEMO_MODE: "true",
      AI_PROVIDER: "deterministic",
      OPENAI_API_KEY: "",
      PAYPAL_CLIENT_ID: "",
      PAYPAL_CLIENT_SECRET: "",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
  },
});
