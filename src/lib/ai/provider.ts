import "server-only";
import type { z } from "zod";
import { AppError } from "../domain/errors";
import { ollamaGenerate, ollamaStatus } from "./providers/ollama";
import { openaiGenerate } from "./providers/openai";
import type { AiMode, AiStatus, StructuredRequest } from "./types";

export function aiMode(): AiMode {
  switch (process.env.AI_PROVIDER || "ollama") {
    case "ollama":
      return "OLLAMA";
    case "openai":
      return "OPENAI";
    case "deterministic":
      if (process.env.DEMO_MODE === "true") return "DETERMINISTIC";
      throw new AppError(
        "AI_FALLBACK_DISABLED",
        "Deterministic fallback requires explicit DEMO_MODE=true.",
        503,
      );
    default:
      throw new AppError(
        "AI_PROVIDER_INVALID",
        "AI_PROVIDER must be ollama, deterministic or openai.",
        503,
      );
  }
}

export async function generateStructured<T extends z.ZodTypeAny>(request: StructuredRequest<T>) {
  const mode = aiMode();
  if (mode === "OLLAMA") return ollamaGenerate(request);
  if (mode === "OPENAI") return openaiGenerate(request);
  throw new AppError("DETERMINISTIC_ONLY", "The deterministic demo has no language model.", 503);
}

export async function aiHealth(): Promise<{ aiProvider: string; aiStatus: AiStatus }> {
  try {
    const mode = aiMode();
    if (mode === "DETERMINISTIC") return { aiProvider: "deterministic", aiStatus: "fallback" };
    if (mode === "OLLAMA") return { aiProvider: "ollama", aiStatus: await ollamaStatus() };
    // Availability is not claimed without contacting the optional external service.
    return {
      aiProvider: "openai",
      aiStatus:
        process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL ? "configured" : "unconfigured",
    };
  } catch {
    return { aiProvider: "unconfigured", aiStatus: "unconfigured" };
  }
}
