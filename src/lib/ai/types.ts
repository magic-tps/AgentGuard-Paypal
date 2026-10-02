import type { z } from "zod";

export type AiMode = "OLLAMA" | "OPENAI" | "DETERMINISTIC";
export type AiMessage = { role: "system" | "user"; content: string };
export type StructuredRequest<T extends z.ZodTypeAny> = {
  schema: T;
  name: string;
  messages: AiMessage[];
};
export type AiStatus = "available" | "unavailable" | "unconfigured" | "fallback" | "configured";
