import "server-only";
import { AppError } from "../domain/errors";
import type { PaymentGateway, PaymentMode } from "./types";
import { createOrder, getOrder, authorizeOrder, purchaseUnit } from "./orders";
import { captureAuthorization, voidAuthorization } from "./payments";
export function paymentMode(): PaymentMode {
  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
    if (process.env.PAYPAL_ENV && process.env.PAYPAL_ENV !== "sandbox")
      throw new AppError("SANDBOX_ONLY", "Use PAYPAL_ENV=sandbox.", 503);
    return "PAYPAL_SANDBOX";
  }
  if (process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_SECRET)
    throw new AppError(
      "PAYPAL_CREDENTIALS_MISSING",
      "Both PayPal Sandbox credentials must be configured.",
      503,
    );
  if (process.env.DEMO_MODE === "true") return "SIMULATED";
  throw new AppError(
    "PAYPAL_CREDENTIALS_MISSING",
    "PayPal credentials are missing. Configure Sandbox credentials or explicitly enable DEMO_MODE.",
    503,
  );
}
export const simulatedGateway: PaymentGateway = {
  mode: "SIMULATED",
  async createOrder(p, id) {
    return {
      id: `SIM-ORDER-${id}`,
      status: "CREATED",
      intent: "AUTHORIZE",
      purchase_units: [purchaseUnit(p, id)],
    };
  },
  async getOrder(order, p, id) {
    return {
      id: order,
      status: "APPROVED",
      intent: "AUTHORIZE",
      purchase_units: [purchaseUnit(p, id)],
    };
  },
  async authorizeOrder(order, p, id) {
    return {
      id: order,
      status: "COMPLETED",
      purchase_units: [
        {
          ...purchaseUnit(p, id),
          payments: {
            authorizations: [
              {
                id: `SIM-AUTH-${id}`,
                status: "CREATED",
                amount: { currency_code: p.currency, value: p.amount.toFixed(2) },
              },
            ],
          },
        },
      ],
    };
  },
  async captureAuthorization(id, p) {
    return {
      id: id.replace("SIM-AUTH-", "SIM-CAPTURE-"),
      status: "COMPLETED",
      amount: { currency_code: p.currency, value: p.amount.toFixed(2) },
    };
  },
  async voidAuthorization() {},
};
const sandboxGateway: PaymentGateway = {
  mode: "PAYPAL_SANDBOX",
  createOrder,
  getOrder: (id) => getOrder(id),
  authorizeOrder: (id, _p, _tx, key) => authorizeOrder(id, key),
  captureAuthorization,
  voidAuthorization,
};
export function getGateway(mode: PaymentMode): PaymentGateway {
  if (mode === "SIMULATED") {
    if (process.env.DEMO_MODE !== "true")
      throw new AppError(
        "DEMO_DISABLED",
        "This simulated transaction cannot execute outside demo mode.",
        409,
      );
    return simulatedGateway;
  }
  if (paymentMode() !== "PAYPAL_SANDBOX")
    throw new AppError(
      "PAYPAL_CREDENTIALS_MISSING",
      "This transaction requires real PayPal Sandbox credentials.",
      503,
    );
  return sandboxGateway;
}
