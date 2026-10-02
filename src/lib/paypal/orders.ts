import "server-only";
import { paypalRequest } from "./client";
import { orderSchema } from "./types";
import type { Purchase } from "../domain/schemas";
import { appUrl } from "../config";
export function purchaseUnit(p: Purchase, id: string) {
  return {
    reference_id: id,
    custom_id: id,
    amount: {
      currency_code: p.currency,
      value: p.amount.toFixed(2),
      breakdown: { item_total: { currency_code: p.currency, value: p.amount.toFixed(2) } },
    },
    items: p.items.map((i) => ({
      name: i.name,
      sku: i.productId,
      quantity: String(i.quantity),
      unit_amount: { currency_code: p.currency, value: (i.unitPriceCents / 100).toFixed(2) },
      category: "PHYSICAL_GOODS",
    })),
  };
}
export async function createOrder(p: Purchase, transactionId: string, requestId: string) {
  const app = appUrl();
  return orderSchema.parse(
    await paypalRequest(
      "/v2/checkout/orders",
      "POST",
      {
        intent: "AUTHORIZE",
        purchase_units: [purchaseUnit(p, transactionId)],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: "AgentGuard",
              shipping_preference: "NO_SHIPPING",
              user_action: "PAY_NOW",
              return_url: `${app}/transactions/${transactionId}?paypal=approved`,
              cancel_url: `${app}/transactions/${transactionId}?paypal=cancelled`,
            },
          },
        },
      },
      requestId,
    ),
  );
}
export async function getOrder(id: string) {
  return orderSchema.parse(await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(id)}`));
}
export async function authorizeOrder(id: string, requestId: string) {
  return orderSchema.parse(
    await paypalRequest(
      `/v2/checkout/orders/${encodeURIComponent(id)}/authorize`,
      "POST",
      {},
      requestId,
    ),
  );
}
