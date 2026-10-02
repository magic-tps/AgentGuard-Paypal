import { afterAll, describe, it, expect, vi } from "vitest";
import { db } from "../src/lib/db";
import { DEMO_USER_ID, DEMO_POLICY, PRODUCT_IDS } from "../src/lib/domain/demo";
import { proposePurchase, decideApproval } from "../src/lib/services/purchases";
import { changeMandate } from "../src/lib/services/mandates";
import { executePayment, verifyOrder } from "../src/lib/services/payments";
import { simulatedGateway } from "../src/lib/paypal/gateway";
import { purchaseUnit } from "../src/lib/paypal/orders";
import type { PaymentGateway } from "../src/lib/paypal/types";
import type { ScenarioId } from "../src/lib/domain/demo";
import { ownedTransaction } from "../src/lib/services/transaction-store";
import { processVerifiedWebhook } from "../src/lib/services/webhooks";
const mandates = new Set<string>();
const eventIds: string[] = [];
async function fixture(scenario: ScenarioId = "normal") {
  const t = await proposePurchase(DEMO_USER_ID, { scenario, confirmLabPolicy: true });
  mandates.add(t.mandateId);
  return t;
}
function gateway() {
  return {
    ...simulatedGateway,
    createOrder: vi.fn(simulatedGateway.createOrder),
    authorizeOrder: vi.fn(simulatedGateway.authorizeOrder),
    captureAuthorization: vi.fn(simulatedGateway.captureAuthorization),
    voidAuthorization: vi.fn(simulatedGateway.voidAuthorization),
  };
}
describe.skipIf(!process.env.DATABASE_URL)(
  "real PostgreSQL payment orchestration, mocked external boundary",
  () => {
    afterAll(async () => {
      const ids = [...mandates];
      const transactions = await db.transaction.findMany({
        where: { mandateId: { in: ids } },
        select: { id: true, purchaseRequestId: true },
      });
      const txIds = transactions.map((t) => t.id);
      await db.$transaction(async (tx) => {
        await tx.decisionReceipt.deleteMany({ where: { transactionId: { in: txIds } } });
        await tx.payPalOperation.deleteMany({ where: { transactionId: { in: txIds } } });
        await tx.humanApproval.deleteMany({ where: { transactionId: { in: txIds } } });
        await tx.policyDecision.deleteMany({ where: { transactionId: { in: txIds } } });
        await tx.auditEvent.deleteMany({ where: { mandateId: { in: ids } } });
        await tx.transactionItem.deleteMany({ where: { transactionId: { in: txIds } } });
        await tx.transaction.deleteMany({ where: { id: { in: txIds } } });
        await tx.purchaseRequest.deleteMany({
          where: { id: { in: transactions.map((t) => t.purchaseRequestId) } },
        });
        await tx.policyVersion.deleteMany({ where: { mandateId: { in: ids } } });
        await tx.spendingMandate.deleteMany({ where: { id: { in: ids } } });
      });
      await db.webhookEvent.deleteMany({ where: { id: { in: eventIds } } });
      await db.$disconnect();
    });
    it.each(["budget", "addons", "injection", "price-block"] as ScenarioId[])(
      "never calls PayPal for %s",
      async (scenario) => {
        const t = await fixture(scenario);
        const g = gateway();
        expect(t.status).toBe("BLOCKED");
        await expect(executePayment(t.id, DEMO_USER_ID, "CREATE", g)).rejects.toThrow();
        expect(g.createOrder).not.toHaveBeenCalled();
        expect(await db.payPalOperation.count({ where: { transactionId: t.id } })).toBe(0);
      },
    );
    it("completes authorize → final check → capture and makes repeated capture idempotent", async () => {
      const t = await fixture();
      const g = gateway();
      const order = await executePayment(t.id, DEMO_USER_ID, "CREATE", g);
      expect(order?.status).toBe("PAYPAL_ORDER_CREATED");
      const captured = await executePayment(t.id, DEMO_USER_ID, "AUTHORIZE", g);
      expect(captured?.status).toBe("CAPTURED");
      expect(captured?.paypalStatus).toBe("SIMULATED_CAPTURED");
      expect(captured?.audits.map((e) => e.type)).toEqual(
        expect.arrayContaining(["PAYPAL_AUTHORIZED", "FINAL_POLICY_CHECK", "PAYPAL_CAPTURED"]),
      );
      await executePayment(t.id, DEMO_USER_ID, "CAPTURE", g);
      expect(g.captureAuthorization).toHaveBeenCalledTimes(1);
    });
    it("waits for a bound human approval then reevaluates", async () => {
      const t = await fixture("approval");
      const g = gateway();
      await executePayment(t.id, DEMO_USER_ID, "CREATE", g);
      expect(g.createOrder).not.toHaveBeenCalled();
      const a = await decideApproval(DEMO_USER_ID, t.approvals[0].id, true);
      expect(a.status).toBe("APPROVED");
      expect(a.approvals[0]).toMatchObject({
        status: "GRANTED",
        amount: 675,
        quoteHash: t.quoteHash,
        approverId: DEMO_USER_ID,
      });
      await executePayment(t.id, DEMO_USER_ID, "CREATE", g);
      expect((await executePayment(t.id, DEMO_USER_ID, "AUTHORIZE", g))?.status).toBe("CAPTURED");
    });
    it("human rejection permanently closes the transaction", async () => {
      const t = await fixture("approval");
      await decideApproval(DEMO_USER_ID, t.approvals[0].id, false);
      const g = gateway();
      await expect(executePayment(t.id, DEMO_USER_ID, "CREATE", g)).rejects.toThrow();
      expect(g.createOrder).not.toHaveBeenCalled();
    });
    it("invalidates approval when the policy changes", async () => {
      const t = await fixture("approval");
      await changeMandate(DEMO_USER_ID, t.mandateId, "edit", {
        expectedVersion: 1,
        policy: { ...DEMO_POLICY, maxTotal: 650 },
      });
      const a = await decideApproval(DEMO_USER_ID, t.approvals[0].id, true);
      expect(a.status).toBe("BLOCKED");
      expect(a.approvals[0].status).toBe("OBSOLETE");
    });
    it("voids an authorization when the policy is deactivated before final check", async () => {
      const t = await fixture();
      const g = gateway();
      await executePayment(t.id, DEMO_USER_ID, "CREATE", g);
      await changeMandate(DEMO_USER_ID, t.mandateId, "deactivate", { expectedVersion: 1 });
      const result = await executePayment(t.id, DEMO_USER_ID, "AUTHORIZE", g);
      expect(result?.status).toBe("VOIDED");
      expect(g.voidAuthorization).toHaveBeenCalledOnce();
      expect(g.captureAuthorization).not.toHaveBeenCalled();
      await expect(executePayment(t.id, DEMO_USER_ID, "CAPTURE", g)).rejects.toThrow();
    });
    it("serializes simultaneous capture requests", async () => {
      const t = await fixture();
      const g = gateway();
      await executePayment(t.id, DEMO_USER_ID, "CREATE", g);
      const results = await Promise.all([
        executePayment(t.id, DEMO_USER_ID, "AUTHORIZE", g),
        executePayment(t.id, DEMO_USER_ID, "AUTHORIZE", g),
      ]);
      expect(results.every((r) => r?.status === "CAPTURED")).toBe(true);
      expect(g.authorizeOrder).toHaveBeenCalledOnce();
      expect(g.captureAuthorization).toHaveBeenCalledOnce();
    });
    it("reserves budget atomically across concurrent transactions", async () => {
      const a = await fixture();
      const b = await proposePurchase(DEMO_USER_ID, {
        mandateId: a.mandateId,
        productId: PRODUCT_IDS.alpha,
      });
      const g = gateway();
      const results = await Promise.all([
        executePayment(a.id, DEMO_USER_ID, "CREATE", g),
        executePayment(b.id, DEMO_USER_ID, "CREATE", g),
      ]);
      expect(results.map((t) => t?.status).sort()).toEqual(["BLOCKED", "PAYPAL_ORDER_CREATED"]);
      expect(g.createOrder).toHaveBeenCalledOnce();
    });
    it("reserves fulfilled quantity when policy and catalog category casing differs", async () => {
      const template = await fixture();
      await changeMandate(DEMO_USER_ID, template.mandateId, "edit", {
        expectedVersion: 1,
        policy: {
          ...DEMO_POLICY,
          maxTotal: 2000,
          autonomousLimit: 1500,
          requireHumanApprovalAbove: 1500,
          productConstraints: { ...DEMO_POLICY.productConstraints, category: " Monitor " },
        },
      });
      await changeMandate(DEMO_USER_ID, template.mandateId, "activate", {
        expectedVersion: 2,
        confirmed: true,
      });
      const first = await proposePurchase(DEMO_USER_ID, {
        mandateId: template.mandateId,
        productId: PRODUCT_IDS.alpha,
      });
      const g = gateway();
      await executePayment(first.id, DEMO_USER_ID, "CREATE", g);
      const second = await proposePurchase(DEMO_USER_ID, {
        mandateId: template.mandateId,
        productId: PRODUCT_IDS.alpha,
      });
      expect(second.status).toBe("BLOCKED");
      expect(second.evaluation.violations).toContain("WRONG_QUANTITY");
      await expect(executePayment(second.id, DEMO_USER_ID, "CREATE", g)).rejects.toThrow();
      expect(g.createOrder).toHaveBeenCalledTimes(1);
    });
    it("persists failure and retries the exact same idempotency key", async () => {
      const t = await fixture();
      const g = gateway();
      g.createOrder.mockRejectedValueOnce(new Error("network interrupted"));
      await expect(executePayment(t.id, DEMO_USER_ID, "CREATE", g)).rejects.toThrow();
      const failure = await db.transaction.findUniqueOrThrow({ where: { id: t.id } });
      expect(failure.lastError).toBeTruthy();
      await executePayment(t.id, DEMO_USER_ID, "CREATE", g);
      expect(g.createOrder.mock.calls[0][2]).toBe(g.createOrder.mock.calls[1][2]);
    });
    it("rejects authorization when PayPal cart identity differs", async () => {
      const t = await fixture();
      const g: PaymentGateway = {
        ...gateway(),
        async getOrder(id, p, txid) {
          const order = await simulatedGateway.getOrder(id, p, txid);
          order.purchase_units![0].items![0].sku = PRODUCT_IDS.warranty;
          return order;
        },
      };
      await executePayment(t.id, DEMO_USER_ID, "CREATE", g);
      await expect(executePayment(t.id, DEMO_USER_ID, "AUTHORIZE", g)).rejects.toThrow(
        "does not match",
      );
      expect(
        await db.payPalOperation.count({ where: { transactionId: t.id, operation: "CAPTURE" } }),
      ).toBe(0);
    });
    it("does not accept an order amount or intent mismatch", async () => {
      const t = await fixture();
      const order = {
        id: "test",
        status: "APPROVED",
        intent: "AUTHORIZE",
        purchase_units: [purchaseUnit(t.currentQuote, t.id)],
      };
      expect(verifyOrder(order, t.currentQuote, t.id)).toBe(true);
      expect(verifyOrder({ ...order, intent: "CAPTURE" }, t.currentQuote, t.id)).toBe(false);
      order.purchase_units[0].amount.value = "1.00";
      expect(verifyOrder(order, t.currentQuote, t.id)).toBe(false);
    });
    it("enforces transaction ownership", async () => {
      const t = await fixture();
      await expect(
        ownedTransaction(db, t.id, "00000000-0000-4000-8000-999999999999"),
      ).rejects.toThrow("not found");
    });
    it("voids an authorization with a changed final amount and never captures it", async () => {
      const t = await fixture();
      const g = gateway();
      const original = g.authorizeOrder.getMockImplementation()!;
      g.authorizeOrder.mockImplementation(async (...args) => {
        const result = await original(...args);
        result.purchase_units![0].payments!.authorizations![0].amount.value = "720.00";
        return result;
      });
      await executePayment(t.id, DEMO_USER_ID, "CREATE", g);
      expect((await executePayment(t.id, DEMO_USER_ID, "AUTHORIZE", g))?.status).toBe("VOIDED");
      expect(g.captureAuthorization).not.toHaveBeenCalled();
    });
    it("reconciles pending captures through idempotent webhooks without a second capture", async () => {
      const t = await fixture();
      const g = gateway();
      g.captureAuthorization.mockImplementation(async (id, p, key) => ({
        ...(await simulatedGateway.captureAuthorization(id, p, key)),
        status: "PENDING",
      }));
      await executePayment(t.id, DEMO_USER_ID, "CREATE", g);
      const pending = await executePayment(t.id, DEMO_USER_ID, "AUTHORIZE", g);
      expect(pending?.status).toBe("FINAL_POLICY_CHECK");
      await executePayment(t.id, DEMO_USER_ID, "CAPTURE", g);
      expect(g.captureAuthorization).toHaveBeenCalledOnce();
      await db.transaction.update({ where: { id: t.id }, data: { mode: "PAYPAL_SANDBOX" } });
      const event = {
        id: `TEST-WH-${t.id}`,
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: pending!.paypalCaptureId!,
          amount: { value: "537.00", currency_code: "USD" },
          supplementary_data: { related_ids: { order_id: pending!.paypalOrderId! } },
        },
      };
      eventIds.push(event.id);
      expect(await processVerifiedWebhook(event)).toMatchObject({
        received: true,
        duplicate: false,
      });
      expect(await processVerifiedWebhook(event)).toMatchObject({
        received: true,
        duplicate: true,
      });
      expect((await db.transaction.findUniqueOrThrow({ where: { id: t.id } })).status).toBe(
        "CAPTURED",
      );
      expect(
        await db.auditEvent.count({ where: { transactionId: t.id, type: "WEBHOOK_RECEIVED" } }),
      ).toBe(1);
    });
  },
);
