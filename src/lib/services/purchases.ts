import "server-only";
import { db, json } from "../db";
import { AppError } from "../domain/errors";
import {
  DEMO_AGENT_ID,
  DEMO_POLICY,
  DEFAULT_INTENT,
  PRODUCT_IDS,
  type ScenarioId,
} from "../domain/demo";
import {
  purchaseSchema,
  itemSchema,
  amountFromItems,
  spendingMandateSchema,
  type Purchase,
  type PurchaseItem,
} from "../domain/schemas";
import { paymentMode } from "../paypal/gateway";
import { selectProduct } from "../ai/shopping-agent";
import {
  audit,
  lockMandate,
  quoteHash,
  ownedTransaction,
  transition,
  evaluateCurrent,
  ensureApproval,
  persistReceipt,
  serializeTransaction,
  withTransaction,
} from "./transaction-store";

function setFixtureAmount(p: Purchase, total: number) {
  const item = p.items[0];
  const amount = Math.round(total * 100);
  const unit = Math.floor(amount / 3);
  return {
    ...p,
    amount: total,
    items: [
      { ...item, quantity: 2, unitPriceCents: unit },
      { ...item, quantity: 1, unitPriceCents: amount - unit * 2 },
    ],
  };
}
export async function proposePurchase(
  userId: string,
  input: {
    mandateId?: string;
    productId?: string;
    query?: string;
    scenario?: ScenarioId;
    confirmLabPolicy?: boolean;
  },
) {
  let mandateId = input.mandateId;
  if (input.scenario) {
    if (!input.confirmLabPolicy)
      throw new AppError(
        "LAB_CONFIRMATION_REQUIRED",
        "Confirm the visible lab mandate before running a scenario.",
        422,
      );
    const lab = await db.spendingMandate.create({
      data: {
        userId,
        name: `Attack Lab · ${input.scenario}`,
        originalIntent: DEFAULT_INTENT,
        status: "ACTIVE",
        versions: {
          create: {
            version: 1,
            policy: json(DEMO_POLICY),
            model: "human-confirmed-lab-template",
            originalIntent: DEFAULT_INTENT,
            confirmedAt: new Date(),
          },
        },
        audits: {
          create: {
            type: "MANDATE_ACTIVATED",
            actor: userId,
            metadata: { source: "ATTACK_LAB", explicitConfirmation: true },
          },
        },
      },
    });
    mandateId = lab.id;
  }
  if (!mandateId) throw new AppError("MANDATE_REQUIRED", "Select an active spending mandate.", 422);
  const mandate = await db.spendingMandate.findFirst({
    where: { id: mandateId, userId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!mandate) throw new AppError("NOT_FOUND", "Mandate not found.", 404);
  if (mandate.status !== "ACTIVE")
    throw new AppError(
      "POLICY_INACTIVE",
      "Activate this mandate before proposing a purchase.",
      409,
    );
  const policy = spendingMandateSchema.parse(mandate.versions[0].policy);
  let selection = {
    productId: input.productId ?? PRODUCT_IDS.alpha,
    explanation:
      "Human-selected controlled catalog product. AgentGuard independently evaluates this proposal.",
    source: "CATALOG_SELECTION",
  };
  if (!input.productId && !input.scenario) {
    const products = await db.product.findMany({
      where: input.query
        ? {
            OR: [
              { name: { contains: input.query, mode: "insensitive" } },
              { description: { contains: input.query, mode: "insensitive" } },
            ],
          }
        : {},
    });
    selection = await selectProduct(policy, products, input.query ?? policy.goal);
  }
  if (input.scenario)
    selection = {
      productId: input.scenario === "injection" ? PRODUCT_IDS.injection : PRODUCT_IDS.alpha,
      explanation: `Server-authored Attack Lab fixture: ${input.scenario}. The proposed cart is evaluated by the same production policy engine.`,
      source: "ATTACK_LAB",
    };
  const product = await db.product.findUnique({
    where: { id: selection.productId },
    include: { merchant: true },
  });
  if (!product) throw new AppError("NOT_FOUND", "Catalog product not found.", 404);
  const toItem = (p: typeof product, quantity: number): PurchaseItem =>
    itemSchema.parse({
      productId: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      condition: p.condition,
      quantity,
      unitPriceCents: p.priceCents,
      specifications: p.specifications,
    });
  let purchase: Purchase = purchaseSchema.parse({
    amount: (product.priceCents * (policy.quantity ?? 1)) / 100,
    currency: product.currency,
    merchantId: product.merchantId,
    merchantName: product.merchant.name,
    policyVersion: mandate.version,
    items: [toItem(product, policy.quantity ?? 1)],
  });
  if (input.scenario === "addons" || input.scenario === "injection") {
    const extras = await db.product.findMany({
      where: { id: { in: [PRODUCT_IDS.warranty, PRODUCT_IDS.cables] } },
      include: { merchant: true },
    });
    purchase.items.push(...extras.map((p) => toItem(p, 1)));
    purchase.amount = amountFromItems(purchase.items);
  }
  if (input.scenario === "budget") purchase = setFixtureAmount(purchase, 812);
  if (input.scenario === "approval" || input.scenario === "price-approval")
    purchase = setFixtureAmount(purchase, 675);
  if (input.scenario === "price-block") purchase = setFixtureAmount(purchase, 720);
  const original = input.scenario?.startsWith("price-")
    ? setFixtureAmount(purchase, 590)
    : purchase;
  return db.$transaction(
    async (tx) => {
      await lockMandate(tx, mandate.id);
      const request = await tx.purchaseRequest.create({
        data: {
          proposal: json(purchase),
          explanation: selection.explanation,
          source: selection.source,
        },
      });
      const created = await tx.transaction.create({
        data: {
          mandateId: mandate.id,
          policyVersionId: mandate.versions[0].id,
          agentId: DEMO_AGENT_ID,
          merchantId: product.merchantId,
          purchaseRequestId: request.id,
          status: "DRAFT",
          amount: purchase.amount,
          currency: purchase.currency,
          quote: json(original),
          currentQuote: json(purchase),
          quoteHash: quoteHash(purchase),
          mode: paymentMode(),
          scenario: input.scenario ?? null,
          riskLevel: "LOW",
          riskScore: 0,
          decision: "ALLOW",
          items: {
            create: purchase.items.map((i) => ({
              productId: i.productId,
              name: i.name,
              quantity: i.quantity,
              unitPriceCents: i.unitPriceCents,
              snapshot: json(i),
            })),
          },
        },
      });
      const t = await ownedTransaction(tx, created.id, userId);
      await audit(
        tx,
        "PURCHASE_PROPOSED",
        DEMO_AGENT_ID,
        { source: selection.source, quoteHash: t.quoteHash },
        t.id,
        t.mandateId,
      );
      await transition(tx, t, "POLICY_CHECKED");
      const { result } = await evaluateCurrent(tx, t, "INITIAL", purchase);
      if (result.violations.includes("SUSPICIOUS_CONTENT"))
        await audit(
          tx,
          "PROMPT_INJECTION_DETECTED",
          "heuristic-detector",
          { note: "Merchant data is untrusted; hard checks enforce independently." },
          t.id,
          t.mandateId,
        );
      if (result.decision === "BLOCK") {
        await transition(tx, t, "BLOCKED");
        await audit(
          tx,
          "TRANSACTION_BLOCKED",
          "policy-engine",
          { violations: result.violations, paypalExecuted: false },
          t.id,
          t.mandateId,
        );
      }
      if (result.decision === "REQUIRE_APPROVAL") {
        await transition(tx, t, "REQUIRES_APPROVAL");
        await ensureApproval(tx, t);
      }
      await persistReceipt(tx, t, result);
      return serializeTransaction(await ownedTransaction(tx, t.id, userId));
    },
    { timeout: 20000 },
  );
}
export async function decideApproval(userId: string, approvalId: string, approve: boolean) {
  const approval = await db.humanApproval.findFirst({
    where: { id: approvalId, transaction: { mandate: { userId } } },
  });
  if (!approval) throw new AppError("NOT_FOUND", "Approval not found.", 404);
  return withTransaction(approval.transactionId, userId, async (tx, t) => {
    const pending = await tx.humanApproval.findUniqueOrThrow({ where: { id: approvalId } });
    if (pending.status !== "PENDING" || t.status !== "REQUIRES_APPROVAL")
      throw new AppError("APPROVAL_CLOSED", "This approval is no longer pending.", 409);
    if (!approve) {
      await tx.humanApproval.update({
        where: { id: approvalId },
        data: { status: "REJECTED", approverId: userId, decidedAt: new Date() },
      });
      await transition(tx, t, "BLOCKED");
      await audit(
        tx,
        "HUMAN_APPROVAL_REJECTED",
        userId,
        { approvalId, amount: Number(pending.amount) },
        t.id,
        t.mandateId,
      );
    } else {
      const { result } = await evaluateCurrent(tx, t, "HUMAN_REVIEW");
      if (result.decision === "BLOCK") {
        await transition(tx, t, "BLOCKED");
        await tx.humanApproval.update({
          where: { id: approvalId },
          data: { status: "OBSOLETE", decidedAt: new Date() },
        });
        await audit(
          tx,
          "TRANSACTION_BLOCKED",
          "policy-engine",
          { reason: "Policy changed before human approval", violations: result.violations },
          t.id,
          t.mandateId,
        );
      } else if (
        t.quoteHash !== pending.quoteHash ||
        t.policyVersionId !== pending.policyVersionId
      ) {
        await tx.humanApproval.update({
          where: { id: approvalId },
          data: { status: "OBSOLETE", decidedAt: new Date() },
        });
        await ensureApproval(tx, t);
        await audit(
          tx,
          "APPROVAL_INVALIDATED",
          "policy-engine",
          { reason: "Cart or amount changed; review the new request" },
          t.id,
          t.mandateId,
        );
      } else {
        await tx.humanApproval.update({
          where: { id: approvalId },
          data: { status: "GRANTED", approverId: userId, decidedAt: new Date() },
        });
        await transition(tx, t, "APPROVED");
        await audit(
          tx,
          "HUMAN_APPROVAL_GRANTED",
          userId,
          {
            approvalId,
            amount: Number(pending.amount),
            quoteHash: t.quoteHash,
            policyVersionId: t.policyVersionId,
          },
          t.id,
          t.mandateId,
        );
      }
    }
    await persistReceipt(tx, t);
    return serializeTransaction(await ownedTransaction(tx, t.id, userId));
  });
}
