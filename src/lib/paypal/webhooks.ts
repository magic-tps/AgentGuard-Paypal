import "server-only";
import { z } from "zod";
import { paypalRequest } from "./client";
import { AppError } from "../domain/errors";
export const webhookSchema = z
  .object({
    id: z.string().min(1).max(200),
    event_type: z.string().min(1).max(100),
    resource: z
      .object({
        id: z.string().optional(),
        status: z.string().optional(),
        amount: z.object({ value: z.string(), currency_code: z.string() }).optional(),
        supplementary_data: z
          .object({
            related_ids: z
              .object({ order_id: z.string().optional(), authorization_id: z.string().optional() })
              .optional(),
          })
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();
export async function verifyWebhook(headers: Headers, event: unknown) {
  if (!process.env.PAYPAL_WEBHOOK_ID)
    throw new AppError(
      "WEBHOOK_NOT_CONFIGURED",
      "PayPal webhook verification is not configured.",
      503,
    );
  const required = [
    "paypal-auth-algo",
    "paypal-cert-url",
    "paypal-transmission-id",
    "paypal-transmission-sig",
    "paypal-transmission-time",
  ];
  if (required.some((h) => !headers.get(h)))
    throw new AppError("WEBHOOK_VERIFICATION_FAILED", "Missing PayPal signature headers.", 400);
  let cert: URL;
  try {
    cert = new URL(headers.get("paypal-cert-url")!);
  } catch {
    throw new AppError("WEBHOOK_VERIFICATION_FAILED", "Invalid certificate URL.", 400);
  }
  if (
    cert.protocol !== "https:" ||
    !(cert.hostname === "paypal.com" || cert.hostname.endsWith(".paypal.com"))
  )
    throw new AppError("WEBHOOK_VERIFICATION_FAILED", "Invalid PayPal certificate origin.", 400);
  const result = (await paypalRequest("/v1/notifications/verify-webhook-signature", "POST", {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: cert.href,
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
    webhook_event: event,
  })) as { verification_status?: string };
  if (result.verification_status !== "SUCCESS")
    throw new AppError(
      "WEBHOOK_VERIFICATION_FAILED",
      "PayPal rejected the webhook signature.",
      400,
    );
  return true;
}
