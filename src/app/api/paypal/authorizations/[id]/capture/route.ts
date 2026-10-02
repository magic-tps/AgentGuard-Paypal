import { z } from "zod";
import { api, body, type RouteContext } from "@/lib/http";
import { db } from "@/lib/db";
import { AppError } from "@/lib/domain/errors";
import { executePayment } from "@/lib/services/payments";
export async function POST(r: Request, c: RouteContext) {
  const { id } = await c.params;
  return api(async (req, user) => {
    z.string()
      .min(3)
      .max(100)
      .regex(/^[A-Za-z0-9-]+$/)
      .parse(id);
    await body(req, z.object({}).strict());
    const t = await db.transaction.findFirst({
      where: { paypalAuthorizationId: id, mandate: { userId: user } },
      select: { id: true },
    });
    if (!t) throw new AppError("NOT_FOUND", "Payment reference not found.", 404);
    return executePayment(t.id, user, "CAPTURE");
  })(r);
}
