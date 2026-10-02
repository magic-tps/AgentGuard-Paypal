import type { RiskLevel } from "../domain/schemas";
export function calculateRisk(input: {
  priceChanged: boolean;
  suspicious: boolean;
  newMerchant: boolean;
  extraItems: boolean;
  approval: boolean;
  hardFailure: boolean;
}) {
  const contributors = [
    {
      code: "PRICE_CHANGE",
      points: 15,
      explanation: "Checkout quote changed",
      enabled: input.priceChanged,
    },
    {
      code: "PROMPT_INJECTION",
      points: 40,
      explanation: "Merchant content contains instruction-like text",
      enabled: input.suspicious,
    },
    {
      code: "NEW_MERCHANT",
      points: 10,
      explanation: "Merchant has no trusted catalog history",
      enabled: input.newMerchant,
    },
    {
      code: "EXTRA_ITEMS",
      points: 25,
      explanation: "Cart contains items outside the mandate",
      enabled: input.extraItems,
    },
    {
      code: "HUMAN_REVIEW",
      points: 15,
      explanation: "Amount exceeds the autonomous threshold",
      enabled: input.approval,
    },
    {
      code: "HARD_RESTRICTION",
      points: 25,
      explanation: "A mandatory policy restriction failed",
      enabled: input.hardFailure,
    },
  ]
    .filter((x) => x.enabled)
    .map(({ code, points, explanation }) => ({ code, points, explanation }));
  const score = Math.min(
    100,
    contributors.reduce((n, x) => n + x.points, 0),
  );
  const level: RiskLevel =
    score < 25 ? "LOW" : score < 50 ? "MEDIUM" : score < 75 ? "HIGH" : "CRITICAL";
  return { score, level, contributors };
}
