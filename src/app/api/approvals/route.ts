import { api } from "@/lib/http";
import { db } from "@/lib/db";
import { transactionInclude, serializeTransaction } from "@/lib/services/transaction-store";
export const GET = api(async (_r, user) =>
  (
    await db.transaction.findMany({
      where: { mandate: { userId: user }, status: "REQUIRES_APPROVAL" },
      include: transactionInclude,
      orderBy: { createdAt: "desc" },
    })
  ).map(serializeTransaction),
);
