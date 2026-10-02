import { beforeEach, it, expect, vi } from "vitest";
vi.mock("../src/lib/paypal/client", () => ({ paypalRequest: vi.fn() }));
import { paypalRequest } from "../src/lib/paypal/client";
import { verifyWebhook } from "../src/lib/paypal/webhooks";
beforeEach(() => {
  vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH-config");
  vi.mocked(paypalRequest).mockReset();
});
const headers = () =>
  new Headers({
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.paypal.com/v1/notifications/certs/CERT",
    "paypal-transmission-id": "transmission",
    "paypal-transmission-sig": "signed",
    "paypal-transmission-time": new Date().toISOString(),
  });
it("accepts only PayPal verified signatures", async () => {
  vi.mocked(paypalRequest).mockResolvedValue({ verification_status: "SUCCESS" });
  await expect(verifyWebhook(headers(), { id: "event" })).resolves.toBe(true);
  expect(paypalRequest).toHaveBeenCalledWith(
    "/v1/notifications/verify-webhook-signature",
    "POST",
    expect.objectContaining({ webhook_id: "WH-config", webhook_event: { id: "event" } }),
  );
});
it("rejects failed signatures", async () => {
  vi.mocked(paypalRequest).mockResolvedValue({ verification_status: "FAILURE" });
  await expect(verifyWebhook(headers(), {})).rejects.toThrow("rejected");
});
it("rejects unsigned or untrusted certificate URLs before network", async () => {
  await expect(verifyWebhook(new Headers(), {})).rejects.toThrow();
  const h = headers();
  h.set("paypal-cert-url", "https://paypal.com.evil.example/cert");
  await expect(verifyWebhook(h, {})).rejects.toThrow();
  expect(paypalRequest).not.toHaveBeenCalled();
});
