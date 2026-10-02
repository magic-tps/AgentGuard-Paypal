import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { AppError } from "../../domain/errors";
import type { StructuredRequest } from "../types";

export async function openaiGenerate<T extends z.ZodTypeAny>(request: StructuredRequest<T>) {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL)
    throw new AppError(
      "OPENAI_CONFIGURATION_MISSING",
      "The optional OpenAI provider needs its key and model. Select Ollama to run locally without a paid API.",
      503,
    );
  const model = process.env.OPENAI_MODEL;
  try {
    const result = await new OpenAI({ timeout: 25000, maxRetries: 1 }).responses.parse({
      model,
      store: false,
      input: request.messages,
      text: { format: zodTextFormat(request.schema, request.name) },
    });
    return {
      value: request.schema.parse(result.output_parsed) as z.infer<T>,
      model: `OPENAI · ${model}`,
      mode: "OPENAI" as const,
    };
  } catch (error) {
    if (error instanceof z.ZodError)
      throw new AppError(
        "AI_OUTPUT_INVALID",
        "The optional provider returned invalid structured output. Nothing was saved.",
        422,
      );
    throw new AppError(
      "AI_UNAVAILABLE",
      "The optional OpenAI provider could not complete this request. Check its configuration or select local Ollama.",
      502,
    );
  }
}
