import "server-only";
import { getAccessToken, sandboxBase } from "./auth";
import { AppError } from "../domain/errors";
export async function paypalRequest(
  path: string,
  method = "GET",
  body?: unknown,
  requestId?: string,
): Promise<unknown> {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(sandboxBase + path, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!response.ok)
      throw new AppError(
        "PAYPAL_OPERATION_FAILED",
        `PayPal Sandbox rejected the operation (HTTP ${response.status}). No success has been assumed. You may retry safely.`,
        502,
      );
    if (response.status === 204) return {};
    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "PAYPAL_UNAVAILABLE",
      "PayPal could not be reached. The outcome is uncertain; retry the same transaction to reconcile safely.",
      502,
    );
  }
}
