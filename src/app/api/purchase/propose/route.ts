import { z } from "zod";
import { api, body } from "@/lib/http";
import { proposePurchase } from "@/lib/services/purchases";
export const POST = api(async (r, user) =>
  proposePurchase(
    user,
    await body(
      r,
      z
        .object({
          mandateId: z.string().uuid().optional(),
          productId: z.string().uuid().optional(),
          query: z.string().max(300).optional(),
          scenario: z
            .enum([
              "normal",
              "budget",
              "addons",
              "approval",
              "injection",
              "price-approval",
              "price-block",
            ])
            .optional(),
          confirmLabPolicy: z.boolean().optional(),
        })
        .strict(),
    ),
  ),
);
