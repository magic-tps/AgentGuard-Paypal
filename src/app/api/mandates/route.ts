import { api } from "@/lib/http";
import { db } from "@/lib/db";
import { mandateInclude } from "@/lib/services/mandates";
export const GET = api(async (_r, user) =>
  db.spendingMandate.findMany({
    where: { userId: user },
    include: mandateInclude,
    orderBy: { createdAt: "desc" },
  }),
);
