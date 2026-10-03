import "server-only";
import { AppError } from "./domain/errors";

type Environment = Record<string, string | undefined>;
export const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];

function invalid(code: string, message: string): never {
  throw new AppError(code, message, 503);
}

export function configuredAppUrl(env: Environment = process.env): URL {
  // Dynamic lookup preserves runtime origin changes in a previously built application.
  const raw: unknown = Reflect.get(env, "NEXT_PUBLIC_APP_URL");
  const value = typeof raw === "string" && raw ? raw : undefined;
  if (!value && (env.NODE_ENV === "production" || env.RENDER === "true"))
    invalid("APP_URL_INVALID", "Configure NEXT_PUBLIC_APP_URL before serving production requests.");
  let url: URL;
  try {
    url = new URL(value ?? "http://localhost:3000");
  } catch {
    return invalid(
      "APP_URL_INVALID",
      "NEXT_PUBLIC_APP_URL must be an absolute application origin.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    invalid("APP_URL_INVALID", "NEXT_PUBLIC_APP_URL must contain only an HTTP(S) origin.");
  const local = loopbackHosts.includes(url.hostname);
  if ((!local && url.protocol !== "https:") || (env.RENDER === "true" && local))
    invalid(
      "APP_URL_INVALID",
      "Public deployment requires a non-loopback HTTPS application origin.",
    );
  return url;
}

export function ollamaConfiguration(env: Environment = process.env) {
  const model = env.OLLAMA_MODEL?.trim();
  const timeout = Number(env.OLLAMA_TIMEOUT_MS || 90000);
  let base: URL;
  try {
    base = new URL(env.OLLAMA_BASE_URL || "http://127.0.0.1:11434");
  } catch {
    return invalid("OLLAMA_CONFIGURATION_INVALID", "Set a valid local OLLAMA_BASE_URL.");
  }
  if (
    !["http:", "https:"].includes(base.protocol) ||
    ![...loopbackHosts, "host.docker.internal"].includes(base.hostname) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/" ||
    !Number.isInteger(timeout) ||
    timeout < 1000 ||
    timeout > 180000
  )
    invalid(
      "OLLAMA_CONFIGURATION_INVALID",
      "Ollama requires a local server URL and a timeout between 1000 and 180000 ms.",
    );
  if (!model || /(?:[:\-]cloud)(?:$|:)/i.test(model))
    invalid(
      "OLLAMA_MODEL_MISSING",
      "Set OLLAMA_MODEL to a downloaded local model. Cloud models are unsupported.",
    );
  return { model, base, timeout };
}

export function validateEnvironment(
  env: Environment = process.env,
  options: { publicDeployment?: boolean; requireWebhook?: boolean } = {},
) {
  const app = configuredAppUrl(env);
  const remote =
    options.publicDeployment || env.RENDER === "true" || !loopbackHosts.includes(app.hostname);
  if (remote && (app.protocol !== "https:" || loopbackHosts.includes(app.hostname)))
    invalid(
      "APP_URL_INVALID",
      "Public deployment requires a non-loopback HTTPS application origin.",
    );
  if (!env.DATABASE_URL) invalid("DATABASE_CONFIGURATION_INVALID", "DATABASE_URL is required.");
  let database: URL;
  try {
    database = new URL(env.DATABASE_URL);
  } catch {
    return invalid("DATABASE_CONFIGURATION_INVALID", "Configure a valid PostgreSQL DATABASE_URL.");
  }
  if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.hostname)
    invalid("DATABASE_CONFIGURATION_INVALID", "Configure a valid PostgreSQL DATABASE_URL.");
  if (
    remote &&
    !["require", "verify-ca", "verify-full"].includes(database.searchParams.get("sslmode") ?? "")
  )
    invalid(
      "DATABASE_CONFIGURATION_INVALID",
      "Public PostgreSQL connections require TLS via sslmode.",
    );
  if (remote || env.DEMO_MODE !== "true") {
    if (!env.OPERATOR_PASSWORD || env.OPERATOR_PASSWORD.length < 12)
      invalid("AUTH_NOT_CONFIGURED", "Configure an operator password of at least 12 characters.");
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)
      invalid("AUTH_NOT_CONFIGURED", "Configure a session secret of at least 32 characters.");
  }
  if (env.PAYPAL_ENV && env.PAYPAL_ENV !== "sandbox")
    invalid("SANDBOX_ONLY", "Only PayPal Sandbox is supported.");
  const client = Boolean(env.PAYPAL_CLIENT_ID),
    secret = Boolean(env.PAYPAL_CLIENT_SECRET);
  if (client !== secret || (!client && env.DEMO_MODE !== "true"))
    invalid(
      "PAYPAL_CREDENTIALS_MISSING",
      "Configure both PayPal Sandbox credentials or explicitly enable simulation.",
    );
  if (options.requireWebhook && (!client || !env.PAYPAL_WEBHOOK_ID))
    invalid(
      "WEBHOOK_NOT_CONFIGURED",
      "Configure Sandbox credentials and PAYPAL_WEBHOOK_ID for signed delivery.",
    );
  const provider = env.AI_PROVIDER || "ollama";
  if (provider === "ollama") {
    if (remote)
      invalid(
        "AI_LOCAL_ONLY",
        "Public deployment must explicitly select deterministic fallback or an optional provider. Ollama is local only.",
      );
    ollamaConfiguration(env);
  } else if (provider === "deterministic") {
    if (env.DEMO_MODE !== "true")
      invalid("AI_FALLBACK_DISABLED", "Deterministic fallback requires explicit DEMO_MODE=true.");
  } else if (provider === "openai") {
    if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL)
      invalid("OPENAI_CONFIGURATION_MISSING", "The optional provider requires its key and model.");
  } else invalid("AI_PROVIDER_INVALID", "Select a supported AI_PROVIDER explicitly.");
}
