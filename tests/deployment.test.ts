import { afterEach, expect, it, vi } from "vitest";
import { configuredAppUrl, validateEnvironment } from "../src/lib/environment";
import { appUrl } from "../src/lib/config";

const publicEnvironment = () => ({
  NODE_ENV: "production",
  RENDER: "true",
  NEXT_PUBLIC_APP_URL: "https://agentguard.example",
  DATABASE_URL: "postgresql://operator:placeholder@database.example/agentguard?sslmode=require",
  AI_PROVIDER: "deterministic",
  DEMO_MODE: "true",
  OPERATOR_PASSWORD: "test-operator-password",
  SESSION_SECRET: "test-session-secret-with-at-least-thirty-two-characters",
  PAYPAL_ENV: "sandbox",
  PAYPAL_CLIENT_ID: "test-client",
  PAYPAL_CLIENT_SECRET: "test-secret",
});
afterEach(() => vi.unstubAllEnvs());

it("accepts explicit public fallback and Sandbox without any paid AI provider", () => {
  expect(() => validateEnvironment(publicEnvironment())).not.toThrow();
});
it.each([
  "",
  "/relative",
  "invalid",
  "http://remote.example",
  "https://user:secret@remote.example",
  "https://remote.example/path",
  "https://remote.example/?query=private",
  "https://remote.example/#fragment",
  "http://localhost:3000",
])("rejects unsafe public application origin case %# without echoing its value", (value) => {
  const env = { ...publicEnvironment(), NEXT_PUBLIC_APP_URL: value };
  expect(() => validateEnvironment(env)).toThrow();
  try {
    validateEnvironment(env);
  } catch (error) {
    if (value) expect(String(error)).not.toContain(value);
  }
});
it("does not default a missing production origin to localhost", () => {
  expect(() => configuredAppUrl({ NODE_ENV: "production" })).toThrow();
  expect(configuredAppUrl({ NODE_ENV: "development" }).origin).toBe("http://localhost:3000");
});
it("reads a changed HTTPS origin at runtime and normalizes its trailing slash", () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://agentguard.example/");
  expect(appUrl()).toBe("https://agentguard.example");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://new-origin.example");
  expect(appUrl()).toBe("https://new-origin.example");
});
it.each(["DATABASE_URL", "OPERATOR_PASSWORD", "SESSION_SECRET"])(
  "requires %s publicly even with DEMO_MODE=true",
  (key) => {
    expect(() => validateEnvironment({ ...publicEnvironment(), [key]: "" })).toThrow();
  },
);
it.each([
  "postgresql://database.example/agentguard",
  "postgresql://database.example/agentguard?sslmode=disable",
  "https://database.example/agentguard?sslmode=require",
])("rejects invalid or non-TLS public database configuration %#", (DATABASE_URL) => {
  expect(() => validateEnvironment({ ...publicEnvironment(), DATABASE_URL })).toThrow();
});
it("keeps both credential pairing and Sandbox-only validation mandatory", () => {
  expect(() => validateEnvironment({ ...publicEnvironment(), PAYPAL_CLIENT_SECRET: "" })).toThrow();
  expect(() => validateEnvironment({ ...publicEnvironment(), PAYPAL_CLIENT_ID: "" })).toThrow();
  expect(() => validateEnvironment({ ...publicEnvironment(), PAYPAL_ENV: "live" })).toThrow();
  expect(() =>
    validateEnvironment({ ...publicEnvironment(), PAYPAL_CLIENT_ID: "", PAYPAL_CLIENT_SECRET: "" }),
  ).not.toThrow();
});
it("requires configured signed webhooks only when checking final webhook readiness", () => {
  expect(() => validateEnvironment(publicEnvironment(), { requireWebhook: true })).toThrow();
  expect(() =>
    validateEnvironment(
      { ...publicEnvironment(), PAYPAL_WEBHOOK_ID: "WH-test" },
      { requireWebhook: true },
    ),
  ).not.toThrow();
});
it("never enables the fallback implicitly or disables remote auth for it", () => {
  expect(() => validateEnvironment({ ...publicEnvironment(), DEMO_MODE: "false" })).toThrow();
  expect(() =>
    validateEnvironment({
      ...publicEnvironment(),
      AI_PROVIDER: "ollama",
      OLLAMA_MODEL: "local-model",
    }),
  ).toThrow("local only");
  expect(() => validateEnvironment({ ...publicEnvironment(), AI_PROVIDER: "openai" })).toThrow();
  expect(() => validateEnvironment({ ...publicEnvironment(), AI_PROVIDER: "unknown" })).toThrow();
});
it("preserves the configured local Ollama demo without operator secrets", () => {
  expect(() =>
    validateEnvironment({
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
      DATABASE_URL: "postgresql://localhost:54329/agentguard",
      DEMO_MODE: "true",
      AI_PROVIDER: "ollama",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      OLLAMA_MODEL: "local-model",
      OLLAMA_TIMEOUT_MS: "180000",
    }),
  ).not.toThrow();
});
