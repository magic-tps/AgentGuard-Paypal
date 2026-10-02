import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "./domain/errors";
import { authenticatedUser } from "./security/auth";
import { rateLimiter } from "./security/rate-limit";
import { appUrl } from "./config";
export function validateOrigin(request: Request) {
  if (["GET", "HEAD"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const configured = new URL(appUrl()).origin;
  if (!origin || origin !== configured)
    throw new AppError(
      "INVALID_ORIGIN",
      "This action must originate from the configured AgentGuard application.",
      403,
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("JSON_REQUIRED", "Send an application/json request.", 415);
}
export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const maxBytes = 32768;
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maxBytes)
    throw new AppError("PAYLOAD_TOO_LARGE", "Request is too large.", 413);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new AppError("PAYLOAD_TOO_LARGE", "Request is too large.", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const raw = Buffer.concat(chunks, size).toString("utf8");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AppError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }
  return schema.parse(value);
}
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  if (error instanceof z.ZodError)
    return NextResponse.json(
      {
        error: {
          code: "INVALID_PAYLOAD",
          message: "The request is invalid.",
          issues: error.issues.map((x) => ({ path: x.path.join("."), message: x.message })),
        },
      },
      { status: 422 },
    );
  if (error instanceof Prisma.PrismaClientInitializationError)
    return NextResponse.json(
      {
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "PostgreSQL is unavailable. Start the database and retry.",
        },
      },
      { status: 503 },
    );
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P1001", "P1002", "P2024"].includes(error.code)
  )
    return NextResponse.json(
      {
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Database temporarily unavailable. Please retry.",
        },
      },
      { status: 503 },
    );
  console.error("AgentGuard request failed", {
    type: error instanceof Error ? error.name : "Unknown",
  });
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "The operation could not be completed. Please retry.",
      },
    },
    { status: 500 },
  );
}
export function api(handler: (request: Request, userId: string) => Promise<unknown>) {
  return async (request: Request) => {
    try {
      validateOrigin(request);
      const user = authenticatedUser(request);
      rateLimiter.check(`operator:${user}`, 180, 60000);
      const result = await handler(request, user);
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
export type RouteContext = { params: Promise<Record<string, string>> };
export const uuid = z.string().uuid();
