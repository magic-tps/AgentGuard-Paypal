import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  CATALOG_SEED,
  DEMO_AGENT_ID,
  DEMO_MANDATE_ID,
  DEMO_MERCHANT_ID,
  DEMO_POLICY,
  DEMO_USER_ID,
  DEFAULT_INTENT,
} from "../src/lib/domain/demo";
import { evaluatePurchase } from "../src/lib/policy/evaluate-purchase";
import { purchaseSchema } from "../src/lib/domain/schemas";
import { createHash } from "node:crypto";
import { json } from "../src/lib/db";
const db = new PrismaClient();
async function seed() {
  await db.user.upsert({
    where: { id: DEMO_USER_ID },
    update: {},
    create: { id: DEMO_USER_ID, email: "operator@agentguard.local", name: "Demo operator" },
  });
  await db.agent.upsert({
    where: { id: DEMO_AGENT_ID },
    update: {},
    create: { id: DEMO_AGENT_ID, userId: DEMO_USER_ID, name: "Atlas · Procurement" },
  });
  await db.merchant.upsert({
    where: { id: DEMO_MERCHANT_ID },
    update: {},
    create: { id: DEMO_MERCHANT_ID, name: "TechStore", trusted: true },
  });
  await db.merchant.upsert({
    where: { name: "Display Supply Co." },
    update: {},
    create: { name: "Display Supply Co.", trusted: false },
  });
  for (const p of CATALOG_SEED)
    await db.product.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, merchantId: DEMO_MERCHANT_ID },
    });
  await db.spendingMandate.upsert({
    where: { id: DEMO_MANDATE_ID },
    update: {},
    create: {
      id: DEMO_MANDATE_ID,
      name: "Workspace monitors",
      originalIntent: DEFAULT_INTENT,
      userId: DEMO_USER_ID,
      status: "ACTIVE",
      versions: {
        create: {
          version: 1,
          policy: DEMO_POLICY,
          originalIntent: DEFAULT_INTENT,
          model: "seed-template",
          confirmedAt: new Date(),
        },
      },
      audits: {
        create: {
          type: "MANDATE_ACTIVATED",
          actor: "seed",
          metadata: { mode: "SIMULATED", note: "Explicit demo seed template" },
        },
      },
    },
  });
  if ((await db.transaction.count()) === 0) {
    const archive = await db.spendingMandate.create({
      data: {
        name: "Demo history · simulated",
        originalIntent: DEFAULT_INTENT,
        userId: DEMO_USER_ID,
        status: "INACTIVE",
        versions: {
          create: {
            version: 1,
            policy: DEMO_POLICY,
            originalIntent: DEFAULT_INTENT,
            model: "seed-template",
            confirmedAt: new Date(),
          },
        },
      },
      include: { versions: true },
    });
    for (const [index, total] of [537, 812, 675, 537, 752, 720, 597].entries()) {
      const product = CATALOG_SEED[index === 6 ? 3 : 0];
      const { id, priceCents: _price, ...rest } = product;
      void _price;
      const unit = Math.floor((total * 100) / 3);
      const items = [
        { ...rest, productId: id, unitPriceCents: unit, quantity: 2 },
        { ...rest, productId: id, unitPriceCents: total * 100 - unit * 2, quantity: 1 },
      ];
      const purchase = purchaseSchema.parse({
        amount: total,
        currency: "USD",
        merchantId: DEMO_MERCHANT_ID,
        merchantName: "TechStore",
        policyVersion: 1,
        items,
      });
      const result = evaluatePurchase(DEMO_POLICY, purchase);
      const resultJson = json(result);
      const quoteHash = createHash("sha256").update(JSON.stringify(purchase)).digest("hex");
      const status =
        result.decision === "BLOCK"
          ? "BLOCKED"
          : result.decision === "REQUIRE_APPROVAL"
            ? "REQUIRES_APPROVAL"
            : index === 0
              ? "CAPTURED"
              : "POLICY_CHECKED";
      const tx = await db.transaction.create({
        data: {
          mandate: { connect: { id: archive.id } },
          policyVersion: { connect: { id: archive.versions[0].id } },
          agent: { connect: { id: DEMO_AGENT_ID } },
          merchant: { connect: { id: DEMO_MERCHANT_ID } },
          purchaseRequest: {
            create: {
              proposal: purchase,
              explanation: "Clearly labeled simulated historical example",
              source: "SEED",
            },
          },
          status,
          amount: total,
          currency: "USD",
          quote: purchase,
          currentQuote: purchase,
          quoteHash,
          mode: "SIMULATED",
          riskLevel: result.riskLevel,
          riskScore: result.riskScore,
          decision: result.decision,
          paypalStatus: status === "CAPTURED" ? "SIMULATED_CAPTURED" : "NOT_EXECUTED",
          createdAt: new Date(Date.now() - (index + 1) * 3600000),
          items: {
            create: purchase.items.map((i) => ({
              productId: i.productId,
              name: i.name,
              quantity: i.quantity,
              unitPriceCents: i.unitPriceCents,
              snapshot: i,
            })),
          },
          decisions: { create: { phase: "INITIAL", result: resultJson } },
          audits: {
            create: {
              type: status === "BLOCKED" ? "TRANSACTION_BLOCKED" : "POLICY_EVALUATED",
              actor: "seed",
              metadata: { mode: "SIMULATED", result: resultJson },
            },
          },
          receipt: {
            create: {
              snapshot: {
                originalIntent: DEFAULT_INTENT,
                policy: DEMO_POLICY,
                purchase,
                result: resultJson,
                mode: "SIMULATED",
                status,
              },
            },
          },
        },
      });
      if (status === "REQUIRES_APPROVAL")
        await db.humanApproval.create({
          data: {
            transactionId: tx.id,
            policyVersionId: tx.policyVersionId,
            amount: total,
            currency: "USD",
            quoteHash,
          },
        });
    }
  }
  // Historical approvals need their own unspent mandate to remain actionable.
  const reviews = await db.transaction.findMany({
    where: {
      status: "REQUIRES_APPROVAL",
      purchaseRequest: { source: "SEED" },
      mandate: { status: "INACTIVE" },
    },
  });
  for (const review of reviews) {
    await db.$transaction(async (tx) => {
      const mandate = await tx.spendingMandate.create({
        data: {
          userId: DEMO_USER_ID,
          name: "Review demo - monitor purchase",
          originalIntent: DEFAULT_INTENT,
          status: "ACTIVE",
          versions: {
            create: {
              version: 1,
              policy: DEMO_POLICY,
              originalIntent: DEFAULT_INTENT,
              model: "seed-template",
              confirmedAt: new Date(),
            },
          },
          audits: {
            create: {
              type: "MANDATE_ACTIVATED",
              actor: "seed",
              metadata: { mode: "SIMULATED", note: "Isolated demo approval mandate" },
            },
          },
        },
        include: { versions: true },
      });
      await tx.transaction.update({
        where: { id: review.id },
        data: {
          mandateId: mandate.id,
          policyVersionId: mandate.versions[0].id,
          scenario: "approval",
        },
      });
      await tx.humanApproval.updateMany({
        where: { transactionId: review.id },
        data: { policyVersionId: mandate.versions[0].id },
      });
    });
  }
  console.log(
    "Seeded AgentGuard: operator, active mandate, agents, merchants, six products and simulated history. Existing data preserved.",
  );
}
seed()
  .catch(() => {
    console.error(
      "Seed failed. Check database connectivity and migrations securely; no values disclosed.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
