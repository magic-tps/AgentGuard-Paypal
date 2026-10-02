import "server-only";
import { aiMode, generateStructured } from "./provider";
import { z } from "zod";
import { spendingMandateSchema, type SpendingPolicy } from "../domain/schemas";
import { AppError } from "../domain/errors";

const draftSchema = z
  .object({
    goal: z.string(),
    currency: z.literal("USD"),
    maxTotal: z.number(),
    autonomousLimit: z.number(),
    quantity: z.number().nullable(),
    allowedMerchants: z.array(z.string()).nullable(),
    blockedMerchants: z.array(z.string()).nullable(),
    productConstraints: z
      .object({
        category: z.string().nullable(),
        allowedConditions: z.array(z.enum(["new", "refurbished", "used"])).nullable(),
        minimumSizeInches: z.number().nullable(),
        minimumResolutionWidth: z.number().nullable(),
        minimumResolutionHeight: z.number().nullable(),
        requiredKeywords: z.array(z.string()).nullable(),
      })
      .strict(),
    forbidden: z.array(z.string()),
    requireHumanApprovalAbove: z.number(),
  })
  .strict();
const responseSchema = z
  .object({ policy: draftSchema.nullable(), clarification: z.string().nullable() })
  .strict();
function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, stripNulls(v)]),
    );
  return value;
}
export function explicitBudget(intent: string) {
  const amounts = [
    ...intent.matchAll(
      /(?:maximum(?:\s+total)?(?:\s+budget)?|max(?:\s+total)?(?:\s+budget)?|budget(?:\s+of)?|under|at most|no more than)\s*[:=]?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/gi,
    ),
  ].map((m) => Number(m[1].replaceAll(",", "")));
  return amounts.length ? Math.min(...amounts) : undefined;
}
export function explicitAutonomousLimit(intent: string) {
  const patterns = [
    /(?:automatically(?:\s+(?:purchase|buy|spend))?|autonomous(?:\s+limit)?|automatic\s+(?:purchases?|spending))(?:\s+(?:up to|below|under))?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /(?:purchases?\s+up to|up to)\s*\$\s*([\d,]+(?:\.\d{1,2})?)\s+(?:(?:may|can)\s+(?:happen|be made)\s+|(?:may|can)\s+be\s+)?automatically/gi,
  ];
  const amounts = patterns.flatMap((pattern) =>
    [...intent.matchAll(pattern)].map((match) => Number(match[1].replaceAll(",", ""))),
  );
  const approvalPatterns = [
    /ask\s+me(?:\s+before\s+(?:spending|buying))?\s+(?:more\s+than|above|over)\s*\$\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /(?:anything|spending|purchases?)\s+(?:above|over)\s*\$\s*([\d,]+(?:\.\d{1,2})?)\s+(?:requires?\s+(?:my\s+|human\s+)?approval|needs?\s+(?:my\s+)?approval)/gi,
  ];
  const approvals = approvalPatterns.flatMap((pattern) =>
    [...intent.matchAll(pattern)].map((match) => Number(match[1].replaceAll(",", ""))),
  );
  if (
    /\balways\s+(?:ask|require\s+(?:my\s+)?approval)|\b(?:never|do not|don't)\s+(?:buy|purchase|spend)\s+automatically|\bno\s+autonomous\s+(?:purchasing|spending)/i.test(
      intent,
    )
  )
    return 0;
  return amounts.length || approvals.length ? Math.min(...amounts, ...approvals) : 0;
}

export function validateIntentPermissions(intent: string, policy: SpendingPolicy) {
  const ceiling = explicitBudget(intent);
  const autonomous = Math.min(explicitAutonomousLimit(intent), policy.maxTotal);
  if (
    ceiling === undefined ||
    policy.maxTotal > ceiling ||
    policy.autonomousLimit > autonomous ||
    policy.requireHumanApprovalAbove > autonomous
  )
    throw new AppError(
      "AI_OUTPUT_INVALID",
      "The generated policy exceeds your explicit budget or automatic spending permission. Clarify the limits and regenerate; this policy was not saved.",
      422,
    );
}
export function compileDemoIntent(intent: string): SpendingPolicy {
  const budget = explicitBudget(intent);
  const quantityMatch = intent.match(/\bbuy\s+(\d+|one|two|three|four|five)\b/i);
  const quantities: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const quantity = quantityMatch
    ? (quantities[quantityMatch[1].toLowerCase()] ?? Number(quantityMatch[1]))
    : undefined;
  if (!budget || !quantity || !/monitors?/i.test(intent))
    throw new AppError(
      "DEMO_INTENT_UNSUPPORTED",
      "The deterministic fallback supports monitor purchases with an explicit quantity and USD budget. Use the example or configure a local Ollama model for general intent.",
      422,
    );
  if (
    /\b(only from|except|merchant|brand|less than|exactly|used|4k|1080p|oled|refresh|hz)\b/i.test(
      intent,
    )
  )
    throw new AppError(
      "DEMO_INTENT_UNSUPPORTED",
      "This intent needs constraints beyond the deterministic fallback. Use local Ollama or the provided monitor example.",
      422,
    );
  const limit = explicitAutonomousLimit(intent);
  const size = intent.match(/(\d+(?:\.\d+)?)\s*[- ]?inch/i);
  const resolution = intent.match(/(\d{3,5})\s*[x×]\s*(\d{3,5})/i);
  const forbids = /\b(no|not|without|exclude)\b/i.test(intent);
  const forbidden = [
    ...(forbids && /refurbished/i.test(intent) ? ["refurbished"] : []),
    ...(forbids && /warrant/i.test(intent) ? ["extended warranty", "warranty"] : []),
    ...(forbids && /accessor/i.test(intent) ? ["accessories"] : []),
  ];
  return spendingMandateSchema.parse({
    goal: `Buy ${quantity} monitors`,
    currency: "USD",
    maxTotal: budget,
    autonomousLimit: Math.min(limit, budget),
    quantity,
    productConstraints: {
      category: "monitor",
      allowedConditions: /\bnew\b/i.test(intent) ? ["new"] : undefined,
      minimumSizeInches: size ? Number(size[1]) : undefined,
      minimumResolutionWidth: resolution
        ? Number(resolution[1])
        : /1440p/i.test(intent)
          ? 2560
          : undefined,
      minimumResolutionHeight: resolution
        ? Number(resolution[2])
        : /1440p/i.test(intent)
          ? 1440
          : undefined,
    },
    forbidden,
    requireHumanApprovalAbove: Math.min(limit, budget),
  });
}
export async function compilePolicy(intent: string) {
  if (aiMode() === "DETERMINISTIC") {
    const policy = compileDemoIntent(intent);
    validateIntentPermissions(intent, policy);
    return {
      policy,
      model: "DETERMINISTIC FALLBACK ? conservative monitor parser",
      simulated: true,
      aiMode: "DETERMINISTIC" as const,
    };
  }
  try {
    const response = await generateStructured({
      schema: responseSchema,
      name: "spending_mandate_draft",
      messages: [
        {
          role: "system",
          content:
            "Compile HUMAN purchasing intent into a DRAFT USD spending mandate. You have no payment tools or authority. Never invent permissions or relax constraints. Preserve all stated quantity, product and forbidden-item restrictions. Default autonomousLimit and requireHumanApprovalAbove to 0 unless explicitly granted. Ask-before-above thresholds cap both limits; always-ask means both are zero. Never raise a stated budget. 1440p means 2560x1440. Omitted constraints use null. If budget, currency, product goal or permissions are ambiguous, return policy:null and a brief clarification. Return policy and clarification fields. Human review is required before activation.",
        },
        { role: "user", content: intent },
      ],
    });
    if (!response.value.policy)
      throw new AppError(
        "INTENT_NEEDS_CLARIFICATION",
        response.value.clarification ??
          "Clarify the product, quantity, USD budget and automatic spending threshold.",
        422,
      );
    const policy = spendingMandateSchema.parse(stripNulls(response.value.policy));
    // Canonical catalog spelling; plural monitor wording refers to the same category.
    if (/^monitors?$/i.test(policy.productConstraints.category ?? ""))
      policy.productConstraints.category = "monitor";
    validateIntentPermissions(intent, policy);
    return { policy, model: response.model, simulated: false, aiMode: response.mode };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof z.ZodError)
      throw new AppError(
        "AI_OUTPUT_INVALID",
        "Model output did not satisfy the strict spending policy schema. Clarify and retry; nothing was saved.",
        422,
      );
    throw new AppError(
      "AI_UNAVAILABLE",
      "Policy compilation failed. Check your selected provider and retry. No mandate was saved or activated.",
      502,
    );
  }
}
