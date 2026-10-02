import { api } from "@/lib/http";
import { db } from "@/lib/db";
import { inspectUntrustedContent } from "@/lib/security/untrusted-content";
export const GET = api(async () => {
  const products = await db.product.findMany({
    include: { merchant: true },
    orderBy: { priceCents: "asc" },
  });
  return products.map((p) => ({
    ...p,
    riskFlags: inspectUntrustedContent(p.description).suspicious
      ? ["PROMPT_INJECTION"]
      : p.condition === "refurbished"
        ? ["REFURBISHED"]
        : [],
  }));
});
