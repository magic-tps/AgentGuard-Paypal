import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";
const port = Number(process.env.E2E_PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("E2E_PORT must be a valid TCP port.");
const localUrl = `http://localhost:${port}`;
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? localUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `${process.env.E2E_PRODUCTION === "true" ? "npm start" : "npm run dev"} -- --port ${port}`,
    url: `${localUrl}/api/session`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      DEMO_MODE: "true",
      AI_PROVIDER: "deterministic",
      OPENAI_API_KEY: "",
      PAYPAL_CLIENT_ID: "",
      PAYPAL_CLIENT_SECRET: "",
      NEXT_PUBLIC_APP_URL: localUrl,
    },
  },
});
