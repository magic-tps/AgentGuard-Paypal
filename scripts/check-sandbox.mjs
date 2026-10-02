import "dotenv/config";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

const app = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const origin = new URL(app).origin;
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(app).hostname))
  throw new Error("Run this check against the local AgentGuard workspace.");

async function request(path, payload, method = payload === undefined ? "GET" : "POST") {
  const response = await fetch(new URL(path, origin), {
    method,
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(45000),
  });
  const result = await response.json();
  return { status: response.status, result };
}
async function successful(path, payload, method) {
  const { status, result } = await request(path, payload, method);
  if (status >= 400) throw new Error(result.error?.message ?? `HTTP ${status}`);
  return result;
}
try {
  const session = await successful("/api/session");
  assert.equal(
    session.mode,
    "PAYPAL_SANDBOX",
    "Configure both Sandbox credentials and restart the server.",
  );
  assert.equal(session.localDemo, true, "Enable the explicit local workspace to run this check.");
  const mandate = await successful("/api/ai/compile-policy", {
    name: `Sandbox validation ${new Date().toISOString()}`,
    intent: "Buy 3 new 27-inch 1440p monitors under $700. Automatically purchase up to $600.",
  });
  assert.equal(mandate.status, "DRAFT");
  await successful(
    `/api/mandates/${mandate.id}`,
    {
      action: "activate",
      expectedVersion: mandate.version,
      confirmed: true,
    },
    "PATCH",
  );
  const purchase = await successful("/api/purchase/propose", {
    mandateId: mandate.id,
    productId: "00000000-0000-4000-8000-000000000011",
  });
  assert.equal(purchase.decision, "ALLOW");
  assert.equal(purchase.amount, 537);
  const order = await successful("/api/paypal/orders", { transactionId: purchase.id });
  assert.equal(order.status, "PAYPAL_ORDER_CREATED");
  assert.equal(order.mode, "PAYPAL_SANDBOX");
  assert.ok(order.paypalOrderId && !order.paypalOrderId.startsWith("SIM-"));
  assert.ok(order.approvalUrl);
  const retry = await successful("/api/paypal/orders", { transactionId: purchase.id });
  assert.equal(retry.paypalOrderId, order.paypalOrderId);
  const blocked = await successful("/api/purchase/propose", {
    scenario: "injection",
    confirmLabPolicy: true,
  });
  assert.equal(blocked.decision, "BLOCK");
  assert.equal(blocked.paypalOrderId, null);
  assert.equal(blocked.operations.length, 0);
  const denied = await request("/api/paypal/orders", { transactionId: blocked.id });
  assert.equal(denied.status, 409);
  const receipt = await successful(`/api/transactions/${blocked.id}`);
  assert.equal(receipt.operations.length, 0);
  const report = {
    checkedAt: new Date().toISOString(),
    paymentMode: order.mode,
    orderId: order.paypalOrderId,
    orderStatus: order.status,
    safeReceipt: `${origin}/transactions/${purchase.id}`,
    blockedReceipt: `${origin}/transactions/${blocked.id}`,
    blockedViolations: blocked.evaluation.violations,
    repeatOrderReturnedSameId: true,
    blockedPaymentOperations: receipt.operations.length,
    buyerApproval: "PENDING: approve in PayPal Sandbox through the safe receipt",
    authorizationAndCapture: "NOT_EXECUTED: require buyer approval",
    compilerMode: session.aiMode,
  };
  mkdirSync(".data", { recursive: true });
  writeFileSync(".data/sandbox-validation.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Sandbox validation failed.");
  process.exitCode = 1;
}
