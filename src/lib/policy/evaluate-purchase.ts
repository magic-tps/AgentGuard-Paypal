import {
  cents,
  purchaseSchema,
  spendingMandateSchema,
  type SpendingPolicy,
  type Purchase,
  type PolicyContext,
  type Evaluation,
  type PolicyCheck,
} from "../domain/schemas";
import { inspectUntrustedContent } from "../security/untrusted-content";
import { calculateRisk } from "../risk";

export const normalizePolicyText = (s: string) => s.toLowerCase().normalize("NFKC").trim();
const normalize = normalizePolicyText;
export function evaluatePurchase(
  policyInput: SpendingPolicy,
  purchaseInput: Purchase,
  context: PolicyContext = { active: true, version: 1 },
  previousQuote?: Purchase,
  merchant?: { trusted: boolean },
): Evaluation {
  const policy = spendingMandateSchema.parse(policyInput);
  const purchase = purchaseSchema.parse(purchaseInput);
  const checks: PolicyCheck[] = [];
  const violations: string[] = [];
  let hardFailure = false;
  const check = (
    code: string,
    passed: boolean,
    expected: unknown,
    actual: unknown,
    explanation: string,
    violation?: string,
    hard = true,
  ) => {
    checks.push({
      code,
      passed,
      expected: typeof expected === "string" ? expected : JSON.stringify(expected),
      actual: typeof actual === "string" ? actual : JSON.stringify(actual),
      explanation,
    });
    if (!passed && violation) {
      violations.push(violation);
      if (hard) hardFailure = true;
    }
  };
  const totalCents = cents(purchase.amount);
  const c = policy.productConstraints;
  const itemTotal = purchase.items.reduce((n, i) => n + i.quantity * i.unitPriceCents, 0);
  check(
    "AMOUNT_INTEGRITY",
    totalCents === itemTotal,
    itemTotal,
    totalCents,
    "Total must exactly equal all line items, in integer cents",
    "AMOUNT_MISMATCH",
  );
  check(
    "POLICY_ACTIVE",
    context.active,
    true,
    context.active,
    "Only a human-activated mandate can authorize spending",
    "POLICY_INACTIVE",
  );
  check(
    "POLICY_VERSION",
    context.version === purchase.policyVersion,
    context.version,
    purchase.policyVersion,
    "Proposal must use the current policy version",
    "POLICY_VERSION_MISMATCH",
  );
  check(
    "MAX_TOTAL",
    totalCents + (context.spentCents ?? 0) <= cents(policy.maxTotal),
    `<= ${policy.maxTotal} including reserved spend`,
    (totalCents + (context.spentCents ?? 0)) / 100,
    "Cumulative reserved and captured purchases must fit the mandate",
    "MAX_TOTAL_EXCEEDED",
  );
  const approval =
    totalCents > cents(Math.min(policy.autonomousLimit, policy.requireHumanApprovalAbove));
  check(
    "AUTONOMOUS_LIMIT",
    !approval,
    `<= ${Math.min(policy.autonomousLimit, policy.requireHumanApprovalAbove)}`,
    purchase.amount,
    "Spending above this threshold requires a bound human approval",
    "AUTONOMOUS_LIMIT_EXCEEDED",
    false,
  );
  check(
    "CURRENCY",
    purchase.currency === policy.currency,
    policy.currency,
    purchase.currency,
    "Currency must match",
    "WRONG_CURRENCY",
  );
  const mainItems = purchase.items.filter(
    (i) => !c.category || normalize(i.category) === normalize(c.category),
  );
  const qty = mainItems.reduce((n, i) => n + i.quantity, 0);
  check(
    "QUANTITY",
    policy.quantity === undefined ||
      (qty === policy.quantity && qty + (context.purchasedQuantity ?? 0) <= policy.quantity),
    policy.quantity ?? "Any quantity",
    qty,
    "Purchase must fulfill the requested quantity without purchasing it twice",
    "WRONG_QUANTITY",
  );
  const categoryOk = mainItems.length === purchase.items.length;
  check(
    "CATEGORY",
    categoryOk,
    c.category ?? "Any category",
    purchase.items.map((i) => i.category),
    "Every cart item must be in the allowed category",
    "CATEGORY_NOT_ALLOWED",
  );
  check(
    "UNAUTHORIZED_ADD_ON",
    categoryOk,
    c.category ?? "No category restriction",
    purchase.items.filter((i) => !mainItems.includes(i)).map((i) => i.name),
    "Accessories and warranties do not inherit permission from a monitor",
    "UNAUTHORIZED_ITEM",
  );
  check(
    "CONDITION",
    purchase.items.every((i) => !c.allowedConditions || c.allowedConditions.includes(i.condition)),
    c.allowedConditions ?? "Any condition",
    purchase.items.map((i) => i.condition),
    "Each item must have an allowed condition",
    "CONDITION_NOT_ALLOWED",
  );
  const specsOk = mainItems.every(
    (i) =>
      (!c.minimumSizeInches || (i.specifications.sizeInches ?? 0) >= c.minimumSizeInches) &&
      (!c.minimumResolutionWidth ||
        (i.specifications.resolutionWidth ?? 0) >= c.minimumResolutionWidth) &&
      (!c.minimumResolutionHeight ||
        (i.specifications.resolutionHeight ?? 0) >= c.minimumResolutionHeight) &&
      (c.requiredKeywords ?? []).every((k) =>
        normalize(i.name + " " + i.description).includes(normalize(k)),
      ),
  );
  check(
    "SPECIFICATIONS",
    specsOk,
    c,
    mainItems.map((i) => i.specifications),
    "Size, resolution and required keywords must all match",
    "SPECIFICATION_NOT_MET",
  );
  // Merchant prose is not authoritative product identity. Do not let descriptions such as 'not refurbished' become permissions.
  const forbidden = purchase.items.filter((i) =>
    policy.forbidden.some((f) =>
      normalize([i.name, i.category, i.condition].join(" ")).includes(
        normalize(f).replace(/accessories$/, "accessor"),
      ),
    ),
  );
  check(
    "FORBIDDEN_ITEMS",
    !forbidden.length,
    policy.forbidden,
    forbidden.map((i) => i.name),
    "Forbidden products cannot be authorized through approval",
    "FORBIDDEN_ITEM",
  );
  const merchantKeys = [normalize(purchase.merchantId), normalize(purchase.merchantName)];
  check(
    "MERCHANT_ALLOWED",
    !policy.allowedMerchants?.length ||
      policy.allowedMerchants.some((m) => merchantKeys.includes(normalize(m))),
    policy.allowedMerchants ?? "All merchants",
    purchase.merchantName,
    "Merchant allow list must match",
    "MERCHANT_NOT_ALLOWED",
  );
  check(
    "MERCHANT_BLOCKED",
    !policy.blockedMerchants?.some((m) => merchantKeys.includes(normalize(m))),
    policy.blockedMerchants ?? [],
    purchase.merchantName,
    "Blocked merchants cannot be approved",
    "MERCHANT_BLOCKED",
  );
  const changed = Boolean(previousQuote && cents(previousQuote.amount) !== totalCents);
  check(
    "PRICE_CHANGE",
    !changed,
    previousQuote?.amount ?? purchase.amount,
    purchase.amount,
    "Changed prices are evaluated against the same hard budget and approval threshold",
    "PRICE_CHANGED",
    false,
  );
  const suspicious = purchase.items.some((i) => inspectUntrustedContent(i.description).suspicious);
  check(
    "UNTRUSTED_CONTENT",
    !suspicious,
    "Product data only",
    suspicious ? "Instruction-like merchant text detected" : "No heuristic signals",
    "Detection is advisory; deterministic restrictions remain authoritative",
    "SUSPICIOUS_CONTENT",
    false,
  );
  const risk = calculateRisk({
    priceChanged: changed,
    suspicious,
    newMerchant: merchant?.trusted === false,
    extraItems: !categoryOk,
    approval,
    hardFailure,
  });
  return {
    decision: hardFailure ? "BLOCK" : approval ? "REQUIRE_APPROVAL" : "ALLOW",
    riskLevel: risk.level,
    riskScore: risk.score,
    riskContributors: risk.contributors,
    violations: [...new Set(violations)],
    checks,
    requiresHumanApproval: !hardFailure && approval,
  };
}
