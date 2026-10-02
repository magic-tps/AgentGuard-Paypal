import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type TransactionStatus } from "@prisma/client";
import { db, json, type DbTransaction } from "../db";
import { AppError } from "../domain/errors";
import {
  purchaseSchema,
  spendingMandateSchema,
  amountFromItems,
  itemSchema,
  cents,
  type Purchase,
  type Evaluation,
} from "../domain/schemas";
import { assertTransition, reservedStatuses } from "../domain/state-machine";
import { evaluatePurchase, normalizePolicyText } from "../policy/evaluate-purchase";

export const transactionInclude = {
  mandate: true,
  policyVersion: true,
  agent: true,
  merchant: true,
  items: true,
  purchaseRequest: true,
  decisions: { orderBy: { createdAt: "asc" as const } },
  approvals: { orderBy: { createdAt: "desc" as const } },
  audits: { orderBy: { createdAt: "asc" as const } },
  operations: true,
  receipt: true,
} satisfies Prisma.TransactionInclude;
export type TransactionRecord = Prisma.TransactionGetPayload<{
  include: typeof transactionInclude;
}>;
export function quoteHash(p: Purchase) {
  return createHash("sha256")
    .update(JSON.stringify(purchaseSchema.parse(p)))
    .digest("hex");
}
export async function lockMandate(tx: DbTransaction, id: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))::text`;
}
export async function ownedTransaction(tx: DbTransaction, id: string, userId: string) {
  const record = await tx.transaction.findFirst({
    where: { id, mandate: { userId } },
    include: transactionInclude,
  });
  if (!record) throw new AppError("NOT_FOUND", "Transaction not found.", 404);
  return record;
}
export async function withTransaction<T>(
  id: string,
  userId: string,
  fn: (tx: DbTransaction, t: TransactionRecord) => Promise<T>,
) {
  const ref = await db.transaction.findFirst({
    where: { id, mandate: { userId } },
    select: { mandateId: true },
  });
  if (!ref) throw new AppError("NOT_FOUND", "Transaction not found.", 404);
  return db.$transaction(
    async (tx) => {
      await lockMandate(tx, ref.mandateId);
      return fn(tx, await ownedTransaction(tx, id, userId));
    },
    { maxWait: 15000, timeout: 120000 },
  );
}
export async function audit(
  tx: DbTransaction,
  type: string,
  actor: string,
  metadata: unknown,
  transactionId?: string,
  mandateId?: string,
) {
  return tx.auditEvent.create({
    data: { type, actor, metadata: json(metadata), transactionId, mandateId },
  });
}
export async function transition(
  tx: DbTransaction,
  t: TransactionRecord,
  status: TransactionStatus,
) {
  assertTransition(t.status, status);
  await tx.transaction.update({ where: { id: t.id }, data: { status } });
  t.status = status;
}
export async function currentQuote(tx: DbTransaction, t: TransactionRecord): Promise<Purchase> {
  const saved = purchaseSchema.parse(t.currentQuote);
  if (t.scenario) return saved; // Attack Lab quotes are immutable server-authored fixtures.
  const products = await tx.product.findMany({
    where: { id: { in: saved.items.map((i) => i.productId) } },
  });
  const items = saved.items.map((old) => {
    const p = products.find((p) => p.id === old.productId);
    if (!p || p.merchantId !== saved.merchantId || p.currency !== saved.currency)
      throw new AppError(
        "CATALOG_CHANGED",
        "Product availability, merchant or currency changed. Create a fresh proposal.",
        409,
      );
    return itemSchema.parse({
      productId: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      condition: p.condition,
      quantity: old.quantity,
      unitPriceCents: p.priceCents,
      specifications: p.specifications,
    });
  });
  return purchaseSchema.parse({ ...saved, items, amount: amountFromItems(items) });
}
export async function evaluateCurrent(
  tx: DbTransaction,
  t: TransactionRecord,
  phase: string,
  purchase?: Purchase,
) {
  const p = purchase ?? (await currentQuote(tx, t));
  const policy = spendingMandateSchema.parse(t.policyVersion.policy);
  const reserved = await tx.transaction.findMany({
    where: { mandateId: t.mandateId, id: { not: t.id }, status: { in: reservedStatuses } },
    select: { amount: true, currentQuote: true },
  });
  const spentCents = reserved.reduce((n, x) => n + cents(Number(x.amount)), 0);
  const purchasedQuantity = reserved.reduce(
    (n, x) =>
      n +
      purchaseSchema
        .parse(x.currentQuote)
        .items.filter(
          (i) =>
            !policy.productConstraints.category ||
            normalizePolicyText(i.category) ===
              normalizePolicyText(policy.productConstraints.category),
        )
        .reduce((a, i) => a + i.quantity, 0),
    0,
  );
  const result = evaluatePurchase(
    policy,
    p,
    {
      active: t.mandate.status === "ACTIVE",
      version: t.mandate.version,
      spentCents,
      purchasedQuantity,
    },
    purchaseSchema.parse(t.quote),
    t.merchant,
  );
  await tx.policyDecision.create({ data: { transactionId: t.id, phase, result: json(result) } });
  await tx.transaction.update({
    where: { id: t.id },
    data: {
      amount: p.amount,
      currentQuote: json(p),
      quoteHash: quoteHash(p),
      decision: result.decision,
      riskLevel: result.riskLevel,
      riskScore: result.riskScore,
    },
  });
  t.currentQuote = JSON.parse(JSON.stringify(p)) as Prisma.JsonValue;
  t.quoteHash = quoteHash(p);
  t.amount = new Prisma.Decimal(p.amount);
  t.decision = result.decision;
  t.riskLevel = result.riskLevel;
  t.riskScore = result.riskScore;
  await audit(
    tx,
    phase === "FINAL" ? "FINAL_POLICY_CHECK" : "POLICY_EVALUATED",
    "policy-engine",
    { phase, result, quoteHash: t.quoteHash },
    t.id,
    t.mandateId,
  );
  return { purchase: p, result };
}
export async function ensureApproval(tx: DbTransaction, t: TransactionRecord) {
  const approval = await tx.humanApproval.upsert({
    where: {
      transactionId_quoteHash_policyVersionId: {
        transactionId: t.id,
        quoteHash: t.quoteHash,
        policyVersionId: t.policyVersionId,
      },
    },
    update: {},
    create: {
      transactionId: t.id,
      policyVersionId: t.policyVersionId,
      amount: t.amount,
      currency: t.currency,
      quoteHash: t.quoteHash,
    },
  });
  await audit(
    tx,
    "HUMAN_APPROVAL_REQUESTED",
    "policy-engine",
    { approvalId: approval.id, amount: String(t.amount) },
    t.id,
    t.mandateId,
  );
  return approval;
}
export async function hasApproval(tx: DbTransaction, t: TransactionRecord) {
  return Boolean(
    await tx.humanApproval.findFirst({
      where: {
        transactionId: t.id,
        policyVersionId: t.policyVersionId,
        quoteHash: t.quoteHash,
        amount: t.amount,
        currency: t.currency,
        status: "GRANTED",
      },
    }),
  );
}
export async function persistReceipt(tx: DbTransaction, t: TransactionRecord, result?: Evaluation) {
  const fresh = await ownedTransaction(tx, t.id, t.mandate.userId);
  const snapshot = {
    transactionId: t.id,
    originalIntent: t.policyVersion.originalIntent,
    policy: t.policyVersion.policy,
    policyVersion: t.policyVersion.version,
    purchase: fresh.currentQuote,
    decision: fresh.decision,
    result: result ?? fresh.decisions.at(-1)?.result,
    status: fresh.status,
    mode: fresh.mode,
    paypalStatus: fresh.paypalStatus,
    paypalOrderId: fresh.paypalOrderId,
    paypalAuthorizationId: fresh.paypalAuthorizationId,
    paypalCaptureId: fresh.paypalCaptureId,
    approvals: fresh.approvals,
    updatedAt: new Date().toISOString(),
  };
  await tx.decisionReceipt.upsert({
    where: { transactionId: t.id },
    create: { transactionId: t.id, snapshot: json(snapshot) },
    update: { snapshot: json(snapshot) },
  });
}
export function serializeTransaction(t: TransactionRecord) {
  return {
    ...t,
    amount: Number(t.amount),
    quote: purchaseSchema.parse(t.quote),
    currentQuote: purchaseSchema.parse(t.currentQuote),
    policy: spendingMandateSchema.parse(t.policyVersion.policy),
    evaluation: t.decisions.at(-1)?.result as unknown as Evaluation,
    approvals: t.approvals.map((a) => ({ ...a, amount: Number(a.amount) })),
  };
}
