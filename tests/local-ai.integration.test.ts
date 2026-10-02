import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/lib/db";
import { compileMandate } from "../src/lib/services/mandates";
import { proposePurchase } from "../src/lib/services/purchases";
import { DEMO_POLICY, DEMO_USER_ID, DEFAULT_INTENT, PRODUCT_IDS } from "../src/lib/domain/demo";
import { GET as health } from "../src/app/api/health/route";

const ids: string[] = [];
function output(maxTotal = 700) {
  return new Response(
    JSON.stringify({
      done: true,
      message: {
        role: "assistant",
        content: JSON.stringify({
          policy: {
            ...DEMO_POLICY,
            maxTotal,
            allowedMerchants: null,
            blockedMerchants: null,
            productConstraints: { ...DEMO_POLICY.productConstraints, requiredKeywords: null },
          },
          clarification: null,
        }),
      },
    }),
  );
}
describe.skipIf(!process.env.DATABASE_URL)("local AI boundary with real PostgreSQL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.auditEvent.deleteMany({ where: { mandateId: { in: ids } } });
      await tx.policyVersion.deleteMany({ where: { mandateId: { in: ids } } });
      await tx.spendingMandate.deleteMany({ where: { id: { in: ids } } });
    });
    await db.$disconnect();
  });
  function local() {
    vi.stubEnv("AI_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_MODEL", "integration-model");
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
  }
  it("persists provider provenance as an inactive draft and requires human activation", async () => {
    local();
    const fetcher = vi.fn().mockResolvedValue(output());
    vi.stubGlobal("fetch", fetcher);
    const mandate = await compileMandate(
      DEMO_USER_ID,
      DEFAULT_INTENT,
      `Local AI fixture ${Date.now()}`,
    );
    ids.push(mandate.id);
    expect(mandate.status).toBe("DRAFT");
    expect(mandate.versions[0]).toMatchObject({
      model: "OLLAMA · integration-model",
      confirmedAt: null,
    });
    const event = await db.auditEvent.findFirstOrThrow({
      where: { mandateId: mandate.id, type: "MANDATE_COMPILED" },
    });
    expect(event.metadata).toMatchObject({ aiMode: "OLLAMA", simulated: false });
    await expect(
      proposePurchase(DEMO_USER_ID, { mandateId: mandate.id, productId: PRODUCT_IDS.alpha }),
    ).rejects.toMatchObject({ code: "POLICY_INACTIVE" });
    expect(await db.transaction.count({ where: { mandateId: mandate.id } })).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects broadened model permissions before saving any mandate", async () => {
    local();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(output(900)));
    const name = `Rejected local AI fixture ${Date.now()}`;
    await expect(compileMandate(DEMO_USER_ID, DEFAULT_INTENT, name)).rejects.toMatchObject({
      code: "AI_OUTPUT_INVALID",
    });
    expect(await db.spendingMandate.count({ where: { name } })).toBe(0);
  });
  it("returns non-sensitive operator health with database and installed-model status", async () => {
    local();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ models: [{ name: "integration-model" }] })),
        ),
    );
    const response = await health(new Request("http://localhost:3000/api/health"));
    expect(await response.json()).toEqual({
      status: "ok",
      database: "ok",
      paypalMode: "simulated",
      aiProvider: "ollama",
      aiStatus: "available",
    });
  });
});
