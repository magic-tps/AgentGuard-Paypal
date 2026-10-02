import { z } from "zod";
import type { Purchase } from "../domain/schemas";
export type PaymentMode = "SIMULATED" | "PAYPAL_SANDBOX";
export const paypalAmount = z.object({
  currency_code: z.string(),
  value: z.string().regex(/^\d+(\.\d{1,2})?$/),
});
export const authorizationSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: paypalAmount,
});
export const captureSchema = z.object({ id: z.string(), status: z.string(), amount: paypalAmount });
export const orderSchema = z.object({
  id: z.string(),
  status: z.string(),
  intent: z.string().optional(),
  links: z.array(z.object({ href: z.string(), rel: z.string() })).optional(),
  purchase_units: z
    .array(
      z.object({
        reference_id: z.string().optional(),
        custom_id: z.string().optional(),
        amount: paypalAmount.optional(),
        items: z
          .array(
            z.object({
              name: z.string(),
              sku: z.string().optional(),
              quantity: z.string(),
              unit_amount: paypalAmount,
            }),
          )
          .optional(),
        payments: z
          .object({
            authorizations: z.array(authorizationSchema).optional(),
            captures: z.array(captureSchema).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});
export type PayPalOrder = z.infer<typeof orderSchema>;
export type PayPalAuthorization = z.infer<typeof authorizationSchema>;
export type PayPalCapture = z.infer<typeof captureSchema>;
export interface PaymentGateway {
  mode: PaymentMode;
  createOrder(purchase: Purchase, transactionId: string, requestId: string): Promise<PayPalOrder>;
  getOrder(id: string, purchase: Purchase, transactionId: string): Promise<PayPalOrder>;
  authorizeOrder(
    id: string,
    purchase: Purchase,
    transactionId: string,
    requestId: string,
  ): Promise<PayPalOrder>;
  captureAuthorization(id: string, purchase: Purchase, requestId: string): Promise<PayPalCapture>;
  voidAuthorization(id: string, requestId: string): Promise<void>;
}
