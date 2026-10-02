import "server-only";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { AppError } from "../../domain/errors";
import type { StructuredRequest, AiStatus } from "../types";

function configuration() {
  const model = process.env.OLLAMA_MODEL?.trim();
  const timeout = Number(process.env.OLLAMA_TIMEOUT_MS || 90000);
  let base: URL;
  try {
    base = new URL(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434");
  } catch {
    throw new AppError("OLLAMA_CONFIGURATION_INVALID", "Set a valid local OLLAMA_BASE_URL.", 503);
  }
  if (
    !["http:", "https:"].includes(base.protocol) ||
    !["localhost", "127.0.0.1", "[::1]", "host.docker.internal"].includes(base.hostname) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/" ||
    !Number.isInteger(timeout) ||
    timeout < 1000 ||
    timeout > 180000
  )
    throw new AppError(
      "OLLAMA_CONFIGURATION_INVALID",
      "Ollama requires a local server URL and a timeout between 1000 and 180000 ms.",
      503,
    );
  if (!model || /(?:[:\-]cloud)(?:$|:)/i.test(model))
    throw new AppError(
      "OLLAMA_MODEL_MISSING",
      "Set OLLAMA_MODEL to a downloaded local model. Cloud models are unsupported.",
      503,
    );
  return { model, base, timeout };
}

export async function ollamaGenerate<T extends z.ZodTypeAny>(request: StructuredRequest<T>) {
  const { model, base, timeout } = configuration();
  // This helper only converts Zod to JSON Schema; it makes no OpenAI API request.
  const format = zodTextFormat(request.schema, request.name).schema;
  try {
    const response = await fetch(new URL("/api/chat", base), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeout),
      redirect: "error",
      body: JSON.stringify({
        model,
        stream: false,
        format,
        keep_alive: "15m",
        messages: request.messages.map((message, index) =>
          index === 0
            ? {
                ...message,
                content: `${message.content}\nReturn JSON matching this schema: ${JSON.stringify(format)}`,
              }
            : message,
        ),
        options: { temperature: 0, num_ctx: 4096, num_predict: 1400 },
      }),
    });
    if (!response.ok)
      throw new AppError(
        "AI_UNAVAILABLE",
        "Ollama inference failed. Check that the server is running and the configured model is downloaded. No policy was saved.",
        502,
      );
    const envelope = z
      .object({
        done: z.literal(true),
        message: z.object({ role: z.literal("assistant"), content: z.string().min(1).max(65536) }),
      })
      .parse(await response.json());
    const value = request.schema.parse(JSON.parse(envelope.message.content)) as z.infer<T>;
    return { value, model: `OLLAMA · ${model}`, mode: "OLLAMA" as const };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      throw new AppError(
        "AI_OUTPUT_INVALID",
        "Ollama returned malformed or invalid structured output. Clarify your request and retry; nothing was saved.",
        422,
      );
    throw new AppError(
      "AI_UNAVAILABLE",
      "Local Ollama is offline or timed out. Start Ollama and retry, or explicitly select the deterministic demo fallback.",
      503,
    );
  }
}

export async function ollamaStatus(): Promise<AiStatus> {
  try {
    const { base, model } = configuration();
    const response = await fetch(new URL("/api/tags", base), {
      signal: AbortSignal.timeout(2500),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) return "unavailable";
    const result = z
      .object({ models: z.array(z.object({ name: z.string() })) })
      .parse(await response.json());
    return result.models.some((entry) => entry.name === model || entry.name === `${model}:latest`)
      ? "available"
      : "unconfigured";
  } catch (error) {
    return error instanceof AppError ? "unconfigured" : "unavailable";
  }
}
