import { z } from "zod";

export const moneySchema = z
  .number()
  .finite()
  .min(0)
  .max(1000000)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001,
    "Use at most two decimal places",
  );
const label = z.string().trim().min(1).max(160);
export const policyShape = z
  .object({
    goal: z.string().trim().min(3).max(500),
    currency: z.literal("USD"),
    maxTotal: moneySchema.refine((n) => n > 0, "Budget must be positive"),
    autonomousLimit: moneySchema,
    quantity: z.number().int().min(1).max(1000).optional(),
    allowedMerchants: z.array(label).max(100).optional(),
    blockedMerchants: z.array(label).max(100).optional(),
    productConstraints: z
      .object({
        category: label.optional(),
        allowedConditions: z
          .array(z.enum(["new", "refurbished", "used"]))
          .min(1)
          .optional(),
        minimumSizeInches: z.number().positive().max(200).optional(),
        minimumResolutionWidth: z.number().int().positive().max(32000).optional(),
        minimumResolutionHeight: z.number().int().positive().max(32000).optional(),
        requiredKeywords: z.array(label).max(30).optional(),
      })
      .strict(),
    forbidden: z.array(label).max(100),
    requireHumanApprovalAbove: moneySchema,
  })
  .strict();
export const spendingMandateSchema = policyShape.superRefine((p, ctx) => {
  if (p.autonomousLimit > p.maxTotal)
    ctx.addIssue({
      code: "custom",
      path: ["autonomousLimit"],
      message: "Autonomous limit exceeds budget",
    });
  if (p.requireHumanApprovalAbove > p.maxTotal)
    ctx.addIssue({
      code: "custom",
      path: ["requireHumanApprovalAbove"],
      message: "Approval threshold exceeds budget",
    });
});
export type SpendingPolicy = z.infer<typeof spendingMandateSchema>;
export const itemSchema = z
  .object({
    productId: z.string().uuid(),
    name: label,
    description: z.string().max(6000),
    category: label,
    condition: z.enum(["new", "refurbished", "used"]),
    quantity: z.number().int().positive().max(1000),
    unitPriceCents: z.number().int().min(0).max(100000000),
    specifications: z
      .object({
        sizeInches: z.number().optional(),
        resolutionWidth: z.number().int().optional(),
        resolutionHeight: z.number().int().optional(),
      })
      .strict(),
  })
  .strict();
export const purchaseSchema = z
  .object({
    amount: moneySchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    merchantId: z.string().uuid(),
    merchantName: label,
    items: z.array(itemSchema).min(1).max(50),
    policyVersion: z.number().int().positive(),
  })
  .strict();
export type Purchase = z.infer<typeof purchaseSchema>;
export type PurchaseItem = z.infer<typeof itemSchema>;
export type Decision = "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export interface PolicyCheck {
  code: string;
  passed: boolean;
  expected: string;
  actual: string;
  explanation: string;
}
export interface Evaluation {
  decision: Decision;
  riskLevel: RiskLevel;
  riskScore: number;
  riskContributors: { code: string; points: number; explanation: string }[];
  violations: string[];
  checks: PolicyCheck[];
  requiresHumanApproval: boolean;
}
export interface PolicyContext {
  active: boolean;
  version: number;
  spentCents?: number;
  purchasedQuantity?: number;
}
export const cents = (value: number) => Math.round(value * 100);
export const amountFromItems = (items: PurchaseItem[]) =>
  items.reduce((n, i) => n + i.unitPriceCents * i.quantity, 0) / 100;
