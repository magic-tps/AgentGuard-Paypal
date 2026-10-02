import { api } from "@/lib/http";
import { db } from "@/lib/db";
import { aiHealth } from "@/lib/ai/provider";
import { paymentMode } from "@/lib/paypal/gateway";

// The operator-only check exposes statuses, never connection strings or credentials.
export const GET = api(async () => {
  const [database, ai] = await Promise.all([
    db.$queryRaw`SELECT 1`.then(() => "ok" as const).catch(() => "unavailable" as const),
    aiHealth(),
  ]);
  const degraded = database !== "ok" || ["unavailable", "unconfigured"].includes(ai.aiStatus);
  return {
    status: degraded ? "degraded" : "ok",
    database,
    paypalMode: paymentMode() === "PAYPAL_SANDBOX" ? "sandbox" : "simulated",
    ...ai,
  };
});
