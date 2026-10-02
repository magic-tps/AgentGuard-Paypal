import { z } from "zod";
import { api, body } from "@/lib/http";
import { compileMandate } from "@/lib/services/mandates";
export const POST = api(async (r, user) => {
  const p = await body(
    r,
    z
      .object({
        intent: z.string().trim().min(15).max(6000),
        name: z.string().trim().min(1).max(100).optional(),
      })
      .strict(),
  );
  return compileMandate(user, p.intent, p.name ?? "New spending mandate");
});
