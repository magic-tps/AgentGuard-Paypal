import { api } from "@/lib/http";
import { db } from "@/lib/db";
import { transactionInclude, serializeTransaction } from "@/lib/services/transaction-store";
export const GET = api(async (_r, user) => {
  const transactions = (
    await db.transaction.findMany({
      where: { mandate: { userId: user } },
      include: transactionInclude,
      orderBy: { createdAt: "desc" },
      take: 500,
    })
  ).map(serializeTransaction);
  return {
    transactions,
    stats: {
      autonomousSpend: transactions
        .filter((t) => t.status === "CAPTURED" && t.decision === "ALLOW")
        .reduce((n, t) => n + t.amount, 0),
      blockedAttempts: transactions.filter((t) => t.status === "BLOCKED").length,
      humanApprovals: transactions.filter((t) => t.status === "REQUIRES_APPROVAL").length,
      protectedAgents: await db.agent.count({ where: { userId: user } }),
      policyViolations: transactions.reduce(
        (n, t) => n + (t.evaluation?.violations.length ?? 0),
        0,
      ),
    },
    scope: "Most recent 500 transactions; simulated and Sandbox spend included and labeled.",
  };
});
