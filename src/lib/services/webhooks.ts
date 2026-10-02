import "server-only";
import { db, json } from "../db";
import { AppError } from "../domain/errors";
import { cents } from "../domain/schemas";
import { webhookSchema } from "../paypal/webhooks";
import {
  audit,
  lockMandate,
  ownedTransaction,
  transition,
  persistReceipt,
} from "./transaction-store";
export async function processVerifiedWebhook(raw: unknown) {
  const event = webhookSchema.parse(raw);
  const resourceId = event.resource.id;
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`webhook:${event.id}`}, 0))::text`;
      if (await tx.webhookEvent.findUnique({ where: { id: event.id } }))
        return { received: true, duplicate: true };
      const orderId = event.resource.supplementary_data?.related_ids?.order_id;
      const authorizationId = event.resource.supplementary_data?.related_ids?.authorization_id;
      const references = [
        ...(resourceId
          ? [
              { paypalCaptureId: resourceId },
              { paypalAuthorizationId: resourceId },
              { paypalOrderId: resourceId },
            ]
          : []),
        ...(orderId ? [{ paypalOrderId: orderId }] : []),
        ...(authorizationId ? [{ paypalAuthorizationId: authorizationId }] : []),
      ];
      const found = references.length
        ? await tx.transaction.findFirst({
            where: { mode: "PAYPAL_SANDBOX", OR: references },
            include: { mandate: true },
          })
        : null;
      const relevant = /^(PAYMENT\.(CAPTURE|AUTHORIZATION)\.|CHECKOUT\.ORDER\.)/.test(
        event.event_type,
      );
      if (relevant && !found)
        throw new AppError(
          "WEBHOOK_TRANSACTION_PENDING",
          "Transaction is not available for reconciliation yet. Retry delivery.",
          503,
        );
      if (found) {
        await lockMandate(tx, found.mandateId);
        const t = await ownedTransaction(tx, found.id, found.mandate.userId);
        await audit(
          tx,
          "WEBHOOK_RECEIVED",
          "paypal-webhook",
          { eventId: event.id, eventType: event.event_type, resourceId },
          t.id,
          t.mandateId,
        );
        if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
          const amount = event.resource.amount;
          const operation = await tx.payPalOperation.findUnique({
            where: { transactionId_operation: { transactionId: t.id, operation: "CAPTURE" } },
          });
          if (
            t.paypalCaptureId !== resourceId ||
            !operation ||
            !amount ||
            amount.currency_code !== t.currency ||
            cents(Number(amount.value)) !== cents(Number(t.amount))
          )
            throw new AppError(
              "WEBHOOK_RECONCILIATION_FAILED",
              "Capture does not match a checked payment operation.",
              409,
            );
          if (t.status !== "CAPTURED") {
            if (t.status !== "FINAL_POLICY_CHECK")
              throw new AppError(
                "WEBHOOK_STATE_MISMATCH",
                "Capture arrived in an unexpected state.",
                409,
              );
            await transition(tx, t, "CAPTURED");
            await tx.transaction.update({
              where: { id: t.id },
              data: { paypalStatus: "CAPTURED", lastError: null },
            });
            await audit(
              tx,
              "PAYPAL_CAPTURED",
              "paypal-webhook",
              { eventId: event.id, captureId: resourceId },
              t.id,
              t.mandateId,
            );
          }
        } else if (
          event.event_type === "PAYMENT.AUTHORIZATION.VOIDED" &&
          t.paypalAuthorizationId === resourceId
        ) {
          if (["AUTHORIZED", "FINAL_POLICY_CHECK"].includes(t.status) && !t.paypalCaptureId) {
            await transition(tx, t, "VOIDED");
            await tx.transaction.update({ where: { id: t.id }, data: { paypalStatus: "VOIDED" } });
          }
        } else if (
          event.event_type === "PAYMENT.CAPTURE.DENIED" &&
          t.paypalCaptureId === resourceId &&
          t.status === "FINAL_POLICY_CHECK"
        ) {
          await transition(tx, t, "FAILED");
          await tx.transaction.update({
            where: { id: t.id },
            data: { paypalStatus: "DENIED", lastError: "PayPal denied the pending capture." },
          });
        }
        await persistReceipt(tx, t);
      } else
        await audit(tx, "WEBHOOK_RECEIVED", "paypal-webhook", {
          eventId: event.id,
          eventType: event.event_type,
          handled: "recorded unsupported event",
        });
      await tx.webhookEvent.create({
        data: {
          id: event.id,
          eventType: event.event_type,
          resourceId,
          metadata: json({
            status: event.resource.status,
            amount: event.resource.amount,
            relatedIds: event.resource.supplementary_data?.related_ids,
          }),
        },
      });
      return { received: true, duplicate: false };
    },
    { timeout: 20000 },
  );
}
