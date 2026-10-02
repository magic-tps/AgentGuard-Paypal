import "server-only";
import { paypalRequest } from "./client";
import { captureSchema } from "./types";
import type { Purchase } from "../domain/schemas";
export async function captureAuthorization(id: string, p: Purchase, requestId: string) {
  return captureSchema.parse(
    await paypalRequest(
      `/v2/payments/authorizations/${encodeURIComponent(id)}/capture`,
      "POST",
      { amount: { currency_code: p.currency, value: p.amount.toFixed(2) }, final_capture: true },
      requestId,
    ),
  );
}
export async function voidAuthorization(id: string, requestId: string) {
  await paypalRequest(
    `/v2/payments/authorizations/${encodeURIComponent(id)}/void`,
    "POST",
    {},
    requestId,
  );
}
