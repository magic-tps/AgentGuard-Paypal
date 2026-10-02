import { z } from "zod";
import { api, body, uuid, type RouteContext } from "@/lib/http";
import { db } from "@/lib/db";
import { AppError } from "@/lib/domain/errors";
import { spendingMandateSchema } from "@/lib/domain/schemas";
import { mandateInclude, changeMandate } from "@/lib/services/mandates";
export async function GET(r: Request, c: RouteContext) {
  const { id } = await c.params;
  return api(async (_r, user) => {
    const m = await db.spendingMandate.findFirst({
      where: { id: uuid.parse(id), userId: user },
      include: mandateInclude,
    });
    if (!m) throw new AppError("NOT_FOUND", "Mandate not found.", 404);
    return m;
  })(r);
}
export async function PATCH(r: Request, c: RouteContext) {
  const { id } = await c.params;
  return api(async (req, user) => {
    const input = await body(
      req,
      z
        .object({
          action: z.enum(["activate", "deactivate", "clone", "edit"]),
          confirmed: z.boolean().optional(),
          policy: spendingMandateSchema.optional(),
          name: z.string().min(1).max(100).optional(),
          expectedVersion: z.number().int().positive(),
        })
        .strict(),
    );
    return changeMandate(user, uuid.parse(id), input.action, input);
  })(r);
}
