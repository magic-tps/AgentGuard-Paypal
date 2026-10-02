import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_SEED, DEMO_MERCHANT_ID } from "../src/lib/domain/demo";
import { purchaseSchema } from "../src/lib/domain/schemas";

const purchase = () => {
  const { id, priceCents, ...product } = CATALOG_SEED[0];
  return purchaseSchema.parse({
    amount: 537,
    currency: "USD",
    merchantId: DEMO_MERCHANT_ID,
    merchantName: "TechStore",
    policyVersion: 1,
    items: [{ ...product, productId: id, quantity: 3, unitPriceCents: priceCents }],
  });
};
const fetchMock = vi.fn<typeof fetch>();
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("PAYPAL_CLIENT_ID", "test-client");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "test-secret");
  vi.stubEnv("PAYPAL_ENV", "sandbox");
  fetchMock.mockResolvedValueOnce(response({ access_token: "test-token", expires_in: 3600 }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("PayPal REST adapter with only fetch substituted", () => {
  it("parses and caches OAuth tokens using server-side client credentials", async () => {
    const { getAccessToken } = await import("../src/lib/paypal/auth");
    expect(await getAccessToken()).toBe("test-token");
    expect(await getAccessToken()).toBe("test-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual([
      "https://api-m.sandbox.paypal.com/v1/oauth2/token",
      expect.objectContaining({
        method: "POST",
        body: "grant_type=client_credentials",
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from("test-client:test-secret").toString("base64")}`,
        }),
      }),
    ]);
  });
  it.each([{}, { access_token: 42 }, { access_token: "" }])(
    "rejects malformed tokens %j",
    async (value) => {
      fetchMock.mockReset().mockResolvedValue(response(value));
      const { getAccessToken } = await import("../src/lib/paypal/auth");
      await expect(getAccessToken()).rejects.toMatchObject({ code: "PAYPAL_AUTH_FAILED" });
    },
  );
  it("reports OAuth rejection without leaking credentials", async () => {
    fetchMock.mockReset().mockResolvedValue(response({ error: "invalid_client" }, 401));
    const { getAccessToken } = await import("../src/lib/paypal/auth");
    await expect(getAccessToken()).rejects.toMatchObject({ code: "PAYPAL_AUTH_FAILED" });
  });
  it("creates AUTHORIZE orders with exact items, return URL and idempotency header", async () => {
    fetchMock.mockResolvedValueOnce(response({ id: "ORDER-1", status: "CREATED" }));
    const { createOrder } = await import("../src/lib/paypal/orders");
    await createOrder(purchase(), "transaction-1", "stable-create-key");
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect(new Headers(init?.headers).get("PayPal-Request-Id")).toBe("stable-create-key");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      intent: "AUTHORIZE",
      purchase_units: [
        {
          custom_id: "transaction-1",
          amount: { value: "537.00", currency_code: "USD" },
          items: [{ sku: CATALOG_SEED[0].id, quantity: "3", unit_amount: { value: "179.00" } }],
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: "http://localhost:3000/transactions/transaction-1?paypal=approved",
          },
        },
      },
    });
  });
  it("authorizes orders with a stable operation key", async () => {
    fetchMock.mockResolvedValueOnce(response({ id: "ORDER-1", status: "COMPLETED" }));
    const { authorizeOrder } = await import("../src/lib/paypal/orders");
    await authorizeOrder("ORDER-1", "authorize-key");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-1/authorize",
    );
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("PayPal-Request-Id")).toBe(
      "authorize-key",
    );
  });
  it("captures only the checked amount and voids with separate operation keys", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        id: "CAPTURE-1",
        status: "COMPLETED",
        amount: { currency_code: "USD", value: "537.00" },
      }),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { captureAuthorization, voidAuthorization } = await import("../src/lib/paypal/payments");
    await captureAuthorization("AUTH-1", purchase(), "capture-key");
    await voidAuthorization("AUTH-2", "void-key");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      amount: { currency_code: "USD", value: "537.00" },
      final_capture: true,
    });
    expect(fetchMock.mock.calls[2][0]).toBe(
      "https://api-m.sandbox.paypal.com/v2/payments/authorizations/AUTH-2/void",
    );
    expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get("PayPal-Request-Id")).toBe(
      "void-key",
    );
  });
  it("reports failed operations and uncertain network outcomes without success", async () => {
    fetchMock.mockResolvedValueOnce(response({ name: "UNPROCESSABLE_ENTITY" }, 422));
    fetchMock.mockRejectedValueOnce(new Error("network failed"));
    const { paypalRequest } = await import("../src/lib/paypal/client");
    await expect(
      paypalRequest("/v2/checkout/orders", "POST", {}, "retry-key"),
    ).rejects.toMatchObject({ code: "PAYPAL_OPERATION_FAILED" });
    await expect(
      paypalRequest("/v2/checkout/orders", "POST", {}, "retry-key"),
    ).rejects.toMatchObject({ code: "PAYPAL_UNAVAILABLE" });
  });
  it("rejects partial credentials and production before any network call", async () => {
    const { getAccessToken } = await import("../src/lib/paypal/auth");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "");
    await expect(getAccessToken()).rejects.toMatchObject({ code: "PAYPAL_CREDENTIALS_MISSING" });
    vi.stubEnv("PAYPAL_ENV", "live");
    await expect(getAccessToken()).rejects.toMatchObject({ code: "SANDBOX_ONLY" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
