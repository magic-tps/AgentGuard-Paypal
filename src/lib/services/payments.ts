import "server-only";
import type { DbTransaction } from "../db";
import { json } from "../db";
import { AppError } from "../domain/errors";
import { cents, purchaseSchema, type Purchase, type Evaluation } from "../domain/schemas";
import { getGateway } from "../paypal/gateway";
import { operationKey } from "../paypal/idempotency";
import {
  orderSchema,
  captureSchema,
  type PaymentMode,
  type PaymentGateway,
  type PayPalOrder,
} from "../paypal/types";
import {
  withTransaction,
  ownedTransaction,
  transition,
  evaluateCurrent,
  ensureApproval,
  hasApproval,
  audit,
  persistReceipt,
  quoteHash,
  type TransactionRecord,
  serializeTransaction,
} from "./transaction-store";

async function operation<T>(
  tx: DbTransaction,
  t: TransactionRecord,
  name: string,
  run: (key: string) => Promise<T>,
): Promise<T> {
  const requestId = operationKey(t.id, name);
  const existing = await tx.payPalOperation.findUnique({ where: { requestId } });
  if (existing?.status === "SUCCEEDED") return existing.result as T;
  if (existing && Date.now() - existing.createdAt.getTime() > 5 * 3600000)
    throw new AppError(
      "RECONCILIATION_REQUIRED",
      "This uncertain PayPal operation is too old for automatic replay. Reconcile its Sandbox status before proceeding.",
      409,
    );
  await tx.payPalOperation.upsert({
    where: { requestId },
    create: { transactionId: t.id, operation: name, mode: t.mode, requestId, status: "PENDING" },
    update: { status: "PENDING" },
  });
  const result = await run(requestId);
  await tx.payPalOperation.update({
    where: { requestId },
    data: { result: json(result ?? {}), status: "SUCCEEDED" },
  });
  return result;
}
export function verifyOrder(order: PayPalOrder, p: Purchase, transactionId: string) {
  const units = order.purchase_units;
  const u = units?.[0];
  if (
    order.intent !== "AUTHORIZE" ||
    units?.length !== 1 ||
    u?.custom_id !== transactionId ||
    u.amount?.currency_code !== p.currency ||
    cents(Number(u.amount?.value)) !== cents(p.amount) ||
    u.items?.length !== p.items.length
  )
    return false;
  return p.items.every((i, index) => {
    const actual = u.items?.[index];
    return (
      actual?.sku === i.productId &&
      actual.name === i.name &&
      Number(actual.quantity) === i.quantity &&
      actual.unit_amount.currency_code === p.currency &&
      cents(Number(actual.unit_amount.value)) === i.unitPriceCents
    );
  });
}
async function gate(tx: DbTransaction, t: TransactionRecord, result: Evaluation) {
  if (result.decision === "BLOCK") {
    await transition(tx, t, "BLOCKED");
    await audit(
      tx,
      "TRANSACTION_BLOCKED",
      "policy-engine",
      { violations: result.violations },
      t.id,
      t.mandateId,
    );
    return false;
  }
  if (result.requiresHumanApproval && !(await hasApproval(tx, t))) {
    if (t.status !== "REQUIRES_APPROVAL") await transition(tx, t, "REQUIRES_APPROVAL");
    await ensureApproval(tx, t);
    return false;
  }
  return true;
}
async function voidHeld(
  tx: DbTransaction,
  t: TransactionRecord,
  gateway: PaymentGateway,
  reason: string,
) {
  if (t.paypalCaptureId)
    throw new AppError(
      "CAPTURE_IN_PROGRESS",
      "A capture already exists. Wait for reconciliation; an authorization with a pending capture cannot be voided here.",
      409,
    );
  if (!t.paypalAuthorizationId)
    throw new AppError("NO_AUTHORIZATION", "There is no authorization to void.", 409);
  await operation(tx, t, "VOID", async (key) => {
    await gateway.voidAuthorization(t.paypalAuthorizationId!, key);
    return { voided: true };
  });
  await transition(tx, t, "VOIDED");
  t.paypalStatus = t.mode === "SIMULATED" ? "SIMULATED_VOIDED" : "VOIDED";
  await tx.transaction.update({
    where: { id: t.id },
    data: { paypalStatus: t.paypalStatus, lastError: reason },
  });
  await audit(
    tx,
    "PAYPAL_VOIDED",
    "payment-orchestrator",
    { mode: t.mode, reason },
    t.id,
    t.mandateId,
  );
}
async function finalCapture(tx: DbTransaction, t: TransactionRecord, gateway: PaymentGateway) {
  if (!["AUTHORIZED", "FINAL_POLICY_CHECK"].includes(t.status) || !t.paypalAuthorizationId)
    throw new AppError(
      "CAPTURE_NOT_AUTHORIZED",
      "Capture requires a stored authorization and final policy check.",
      409,
    );
  if (t.status === "AUTHORIZED") await transition(tx, t, "FINAL_POLICY_CHECK");
  const binding = await tx.payPalOperation.findUnique({
    where: { transactionId_operation: { transactionId: t.id, operation: "BOUND_QUOTE" } },
  });
  const authorizedQuote = purchaseSchema.parse(binding?.result);
  const storedAuthorization = await tx.payPalOperation.findUnique({
    where: { transactionId_operation: { transactionId: t.id, operation: "AUTHORIZE" } },
  });
  const authorization = orderSchema.parse(storedAuthorization?.result).purchase_units?.[0]?.payments
    ?.authorizations?.[0];
  let final: Awaited<ReturnType<typeof evaluateCurrent>>;
  try {
    final = await evaluateCurrent(tx, t, "FINAL");
  } catch (error) {
    if (error instanceof AppError && error.code === "CATALOG_CHANGED") {
      await voidHeld(tx, t, gateway, error.message);
      return;
    }
    throw error;
  }
  const { purchase, result } = final;
  const changed = quoteHash(purchase) !== quoteHash(authorizedQuote);
  const financialMismatch =
    !authorization ||
    authorization.id !== t.paypalAuthorizationId ||
    authorization.amount.currency_code !== purchase.currency ||
    cents(Number(authorization.amount.value)) !== cents(purchase.amount);
  if (
    changed ||
    financialMismatch ||
    result.decision === "BLOCK" ||
    (result.requiresHumanApproval && !(await hasApproval(tx, t)))
  ) {
    await audit(
      tx,
      "FINAL_CHECK_REJECTED",
      "policy-engine",
      { changed, financialMismatch, violations: result.violations },
      t.id,
      t.mandateId,
    );
    await voidHeld(
      tx,
      t,
      gateway,
      "Final policy check failed or the authorized cart changed. Create a new proposal for review.",
    );
    return;
  }
  const capture = captureSchema.parse(
    await operation(tx, t, "CAPTURE", (key) =>
      gateway.captureAuthorization(t.paypalAuthorizationId!, purchase, key),
    ),
  );
  if (
    capture.amount.currency_code !== purchase.currency ||
    cents(Number(capture.amount.value)) !== cents(purchase.amount)
  )
    throw new AppError(
      "CAPTURE_MISMATCH",
      "PayPal capture reconciliation is required: returned amount differs from the checked amount.",
      502,
    );
  t.paypalCaptureId = capture.id;
  t.paypalStatus =
    t.mode === "SIMULATED"
      ? `SIMULATED_${capture.status === "COMPLETED" ? "CAPTURED" : capture.status}`
      : capture.status === "COMPLETED"
        ? "CAPTURED"
        : capture.status;
  await tx.transaction.update({
    where: { id: t.id },
    data: { paypalCaptureId: capture.id, paypalStatus: t.paypalStatus },
  });
  if (capture.status === "COMPLETED") {
    await transition(tx, t, "CAPTURED");
    await audit(
      tx,
      "PAYPAL_CAPTURED",
      "payment-orchestrator",
      { mode: t.mode, captureId: capture.id },
      t.id,
      t.mandateId,
    );
  } else if (capture.status === "PENDING")
    await audit(
      tx,
      "PAYPAL_CAPTURE_PENDING",
      "payment-orchestrator",
      { captureId: capture.id },
      t.id,
      t.mandateId,
    );
  else
    throw new AppError(
      "PAYPAL_CAPTURE_FAILED",
      "PayPal did not complete the capture. Review its status before retrying.",
      502,
    );
}
type PaymentAction = "CREATE" | "AUTHORIZE" | "CAPTURE" | "VOID";
export async function executePayment(
  id: string,
  userId: string,
  action: PaymentAction,
  injectedGateway?: PaymentGateway,
) {
  const outcome = await withTransaction(id, userId, async (tx, t) => {
    try {
      if (t.status === "CAPTURED" && action !== "VOID")
        return { transaction: serializeTransaction(t) };
      if (t.status === "VOIDED" && action === "VOID")
        return { transaction: serializeTransaction(t) };
      if (t.paypalCaptureId && t.status === "FINAL_POLICY_CHECK" && action !== "VOID")
        return { transaction: serializeTransaction(t) };
      if (["BLOCKED", "VOIDED", "FAILED"].includes(t.status))
        throw new AppError(
          "TRANSACTION_CLOSED",
          `A ${t.status} transaction cannot execute payments.`,
          409,
        );
      const gateway = injectedGateway ?? getGateway(t.mode as PaymentMode);
      if (gateway.mode !== t.mode)
        throw new AppError(
          "MODE_MISMATCH",
          "Payment environment differs from the transaction.",
          409,
        );
      if (action === "CREATE") {
        if (t.paypalOrderId) return { transaction: serializeTransaction(t) };
        if (!["POLICY_CHECKED", "APPROVED", "REQUIRES_APPROVAL"].includes(t.status))
          throw new AppError(
            "INVALID_PAYMENT_STATE",
            "This transaction is not ready for an order.",
            409,
          );
        const { purchase, result } = await evaluateCurrent(tx, t, "PRE_ORDER");
        if (await gate(tx, t, result)) {
          if (t.status === "REQUIRES_APPROVAL") await transition(tx, t, "APPROVED");
          const bound = purchaseSchema.parse(
            await operation(tx, t, "BOUND_QUOTE", async () => purchase),
          );
          if (quoteHash(bound) !== quoteHash(purchase))
            throw new AppError(
              "QUOTE_CHANGED_AFTER_ORDER_ATTEMPT",
              "The quote changed after an order attempt. Create a new proposal; this order key cannot be reused with a different cart.",
              409,
            );
          const order = orderSchema.parse(
            await operation(tx, t, "CREATE", (key) => gateway.createOrder(bound, t.id, key)),
          );
          const approvalUrl = order.links?.find(
            (l) => l.rel === "payer-action" || l.rel === "approve",
          )?.href;
          if (
            approvalUrl &&
            new URL(approvalUrl).hostname !== "www.sandbox.paypal.com" &&
            new URL(approvalUrl).hostname !== "sandbox.paypal.com"
          )
            throw new AppError(
              "INVALID_PAYPAL_LINK",
              "PayPal returned an unexpected approval URL.",
              502,
            );
          await transition(tx, t, "PAYPAL_ORDER_CREATED");
          t.paypalOrderId = order.id;
          await tx.transaction.update({
            where: { id: t.id },
            data: {
              paypalOrderId: order.id,
              paypalStatus: t.mode === "SIMULATED" ? "SIMULATED_CREATED" : order.status,
              approvalUrl: approvalUrl ?? null,
            },
          });
          await audit(
            tx,
            "PAYPAL_ORDER_CREATED",
            "payment-orchestrator",
            { mode: t.mode, orderId: order.id },
            t.id,
            t.mandateId,
          );
        }
      } else if (action === "AUTHORIZE") {
        if (!t.paypalOrderId)
          throw new AppError("ORDER_REQUIRED", "Create the order before authorizing.", 409);
        if (t.status === "PAYPAL_ORDER_CREATED") {
          const purchase = purchaseSchema.parse(t.currentQuote);
          const order = await gateway.getOrder(t.paypalOrderId, purchase, t.id);
          if (!["APPROVED", "COMPLETED"].includes(order.status))
            throw new AppError(
              "BUYER_APPROVAL_REQUIRED",
              "Approve this order in PayPal Sandbox before continuing.",
              409,
            );
          if (!verifyOrder(order, purchase, t.id))
            throw new AppError(
              "ORDER_MISMATCH",
              "PayPal order does not match the immutable checked cart. Capture is prohibited.",
              409,
            );
          await transition(tx, t, "PAYER_APPROVED");
          await audit(
            tx,
            "PAYPAL_PAYER_APPROVED",
            "payment-orchestrator",
            { mode: t.mode },
            t.id,
            t.mandateId,
          );
        }
        if (t.status === "PAYER_APPROVED") {
          const order = orderSchema.parse(
            await operation(tx, t, "AUTHORIZE", (key) =>
              gateway.authorizeOrder(
                t.paypalOrderId!,
                purchaseSchema.parse(t.currentQuote),
                t.id,
                key,
              ),
            ),
          );
          const auth = order.purchase_units?.[0]?.payments?.authorizations;
          if (auth?.length !== 1 || auth[0].status !== "CREATED")
            throw new AppError(
              "PAYPAL_AUTHORIZATION_FAILED",
              "PayPal did not return exactly one valid authorization.",
              502,
            );
          t.paypalAuthorizationId = auth[0].id;
          await tx.transaction.update({
            where: { id: t.id },
            data: {
              paypalAuthorizationId: auth[0].id,
              paypalStatus: t.mode === "SIMULATED" ? "SIMULATED_AUTHORIZED" : "AUTHORIZED",
            },
          });
          await transition(tx, t, "AUTHORIZED");
          await audit(
            tx,
            "PAYPAL_AUTHORIZED",
            "payment-orchestrator",
            { mode: t.mode, authorizationId: auth[0].id },
            t.id,
            t.mandateId,
          );
        }
        await finalCapture(tx, t, gateway);
      } else if (action === "CAPTURE") await finalCapture(tx, t, gateway);
      else await voidHeld(tx, t, gateway, "Authorization voided by the human operator.");
      await tx.transaction.update({
        where: { id: t.id },
        data: { lastError: t.status === "VOIDED" ? undefined : null },
      });
      await persistReceipt(tx, t);
      return { transaction: serializeTransaction(await ownedTransaction(tx, t.id, userId)) };
    } catch (error) {
      const safe =
        error instanceof AppError
          ? error
          : new AppError(
              "PAYMENT_FAILED",
              "The payment operation could not be completed. No success has been assumed. Retry this transaction safely.",
              502,
            );
      await tx.transaction.update({ where: { id: t.id }, data: { lastError: safe.message } });
      await audit(
        tx,
        "PAYMENT_OPERATION_FAILED",
        "payment-orchestrator",
        { action, code: safe.code, message: safe.message },
        t.id,
        t.mandateId,
      );
      await persistReceipt(tx, t);
      return { error: safe };
    }
  });
  if (outcome.error) throw outcome.error;
  return outcome.transaction;
}
