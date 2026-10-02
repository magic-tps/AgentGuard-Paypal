import { it, expect, vi } from "vitest";
import { POST as compile } from "../src/app/api/ai/compile-policy/route";
import { POST as propose } from "../src/app/api/purchase/propose/route";
import { POST as orders } from "../src/app/api/paypal/orders/route";
import { POST as webhook } from "../src/app/api/paypal/webhook/route";
import { body, validateOrigin } from "../src/lib/http";
import { z } from "zod";
const req = (payload: unknown, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/test", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
it("rejects invalid intent payload before calling the compiler", async () => {
  const r = await compile(req({ intent: 12 }));
  expect(r.status).toBe(422);
  expect((await r.json()).error.code).toBe("INVALID_PAYLOAD");
});
it("does not accept client financial decisions", async () => {
  expect((await propose(req({ decision: "ALLOW", amount: 1 }))).status).toBe(422);
  expect((await orders(req({ transactionId: "anything", decision: "ALLOW" }))).status).toBe(422);
});
it("rejects cross-origin state changes", async () =>
  expect((await compile(req({ intent: "Buy monitors" }, "https://evil.example"))).status).toBe(
    403,
  ));
it("validates the current server origin after a runtime configuration change", () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3002");
  try {
    expect(() => validateOrigin(req({}, "http://localhost:3002"))).not.toThrow();
    expect(() => validateOrigin(req({}, "http://localhost:3000"))).toThrow();
  } finally {
    vi.unstubAllEnvs();
  }
});
it("handles malformed JSON with controlled error", async () => {
  const r = await compile(
    new Request("http://localhost:3000/api/test", {
      method: "POST",
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      body: "{",
    }),
  );
  expect(r.status).toBe(400);
  expect(JSON.stringify(await r.json())).not.toContain("stack");
});
it("never accepts unsigned webhooks", async () => {
  const r = await webhook(
    req({ id: "WH-test", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "unknown" } }),
  );
  expect([400, 503]).toContain(r.status);
});
it("rejects oversized streaming JSON before consuming the entire request", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(17000));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("http://localhost:3000/api/test", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: string });
  await expect(body(request, z.unknown())).rejects.toMatchObject({
    code: "PAYLOAD_TOO_LARGE",
    status: 413,
  });
  expect(cancelled).toBe(true);
});
it("decodes multibyte JSON correctly across request chunks", async () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ intent: "Comprar monitores: aprobación" }),
  );
  const request = new Request("http://localhost:3000/api/test", {
    method: "POST",
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: string });
  await expect(body(request, z.object({ intent: z.string() }))).resolves.toEqual({
    intent: "Comprar monitores: aprobación",
  });
});
