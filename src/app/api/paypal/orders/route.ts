import { z } from "zod";
import { api, body } from "@/lib/http";
import { executePayment } from "@/lib/services/payments";
export const POST = api(async (r, user) => {
  const input = await body(r, z.object({ transactionId: z.string().uuid() }).strict());
  return executePayment(input.transactionId, user, "CREATE");
});
