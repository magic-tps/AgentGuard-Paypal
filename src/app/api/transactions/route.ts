import { api } from "@/lib/http";
import { db } from "@/lib/db";
import { transactionInclude, serializeTransaction } from "@/lib/services/transaction-store";
export const GET = api(async (_r, user) =>
  (
    await db.transaction.findMany({
      where: { mandate: { userId: user } },
      include: transactionInclude,
      orderBy: { createdAt: "desc" },
      take: 500,
    })
  ).map(serializeTransaction),
);
