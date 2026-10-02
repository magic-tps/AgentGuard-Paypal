import { it, expect } from "vitest";
import { assertTransition } from "../src/lib/domain/state-machine";
it.each([
  ["CAPTURED", "CAPTURED"],
  ["VOIDED", "CAPTURED"],
  ["BLOCKED", "PAYPAL_ORDER_CREATED"],
  ["REQUIRES_APPROVAL", "PAYPAL_ORDER_CREATED"],
  ["POLICY_CHECKED", "CAPTURED"],
] as const)("rejects %s -> %s", (from, to) => expect(() => assertTransition(from, to)).toThrow());
it("allows authorization, final check, capture", () => {
  expect(() => {
    assertTransition("PAYER_APPROVED", "AUTHORIZED");
    assertTransition("AUTHORIZED", "FINAL_POLICY_CHECK");
    assertTransition("FINAL_POLICY_CHECK", "CAPTURED");
  }).not.toThrow();
});
