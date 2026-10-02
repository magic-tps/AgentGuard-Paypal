import "server-only";
import { AppError } from "../domain/errors";
import { z } from "zod";
const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
});
let token: { value: string; expires: number } | undefined;
export const sandboxBase = "https://api-m.sandbox.paypal.com";
export async function getAccessToken() {
  if (process.env.PAYPAL_ENV && process.env.PAYPAL_ENV !== "sandbox")
    throw new AppError("SANDBOX_ONLY", "This application only supports PayPal Sandbox.", 503);
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET)
    throw new AppError(
      "PAYPAL_CREDENTIALS_MISSING",
      "Configure both PayPal Sandbox credentials to execute this payment.",
      503,
    );
  if (token && token.expires > Date.now()) return token.value;
  const response = await fetch(`${sandboxBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new AppError(
      "PAYPAL_AUTH_FAILED",
      "PayPal Sandbox authentication failed. Check server credentials.",
      502,
    );
  const parsed = tokenSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new AppError(
      "PAYPAL_AUTH_FAILED",
      "PayPal returned an invalid authentication response.",
      502,
    );
  const result = parsed.data;
  token = {
    value: result.access_token,
    expires: Date.now() + Math.max(0, (result.expires_in ?? 300) - 60) * 1000,
  };
  return token.value;
}
