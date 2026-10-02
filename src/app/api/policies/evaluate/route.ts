import { z } from "zod";
import { api, body } from "@/lib/http";
import { db } from "@/lib/db";
import { AppError } from "@/lib/domain/errors";
import { purchaseSchema, spendingMandateSchema } from "@/lib/domain/schemas";
import { evaluatePurchase } from "@/lib/policy/evaluate-purchase";
export const POST = api(async (r, user) => {
  const input = await body(
    r,
    z.object({ mandateId: z.string().uuid(), purchase: purchaseSchema }).strict(),
  );
  const m = await db.spendingMandate.findFirst({
    where: { id: input.mandateId, userId: user },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!m) throw new AppError("NOT_FOUND", "Mandate not found.", 404);
  return {
    evaluation: evaluatePurchase(
      spendingMandateSchema.parse(m.versions[0].policy),
      input.purchase,
      { active: m.status === "ACTIVE", version: m.version },
    ),
    advisory: true,
    message:
      "Preview only. Payment routes reconstruct catalog items and reevaluate stored transactions.",
  };
});
