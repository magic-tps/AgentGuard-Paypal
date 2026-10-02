import { it, expect } from "vitest";
import {
  compileDemoIntent,
  explicitBudget,
  explicitAutonomousLimit,
  validateIntentPermissions,
} from "../src/lib/ai/policy-compiler";
import { DEFAULT_INTENT, DEMO_POLICY } from "../src/lib/domain/demo";
it("compiles the full demo intent", () => {
  expect(compileDemoIntent(DEFAULT_INTENT)).toMatchObject({
    maxTotal: 700,
    autonomousLimit: 600,
    quantity: 3,
    productConstraints: {
      allowedConditions: ["new"],
      minimumSizeInches: 27,
      minimumResolutionWidth: 2560,
      minimumResolutionHeight: 1440,
    },
    forbidden: ["refurbished", "extended warranty", "warranty", "accessories"],
  });
});
it("compiles the critical path intent", () =>
  expect(
    compileDemoIntent(
      "Buy 3 new 27-inch 1440p monitors under $700. Automatically purchase up to $600.",
    ),
  ).toMatchObject({ maxTotal: 700, autonomousLimit: 600, quantity: 3 }));
it("never invents automatic spending permission", () =>
  expect(compileDemoIntent("Buy 3 new monitors under $700.").autonomousLimit).toBe(0));
it("takes the conservative explicit budget", () =>
  expect(explicitBudget("Budget $700; maximum total $650")).toBe(650));
it("requires explicit budget, quantity and supported demo constraints", () => {
  expect(() => compileDemoIntent("Buy a few good monitors")).toThrow();
  expect(() => compileDemoIntent("Buy 3 OLED monitors under $700")).toThrow();
});
it("does not convert purchases needing approval into automatic spending", () => {
  expect(
    compileDemoIntent("Buy 3 new monitors under $700. Purchases up to $600 require my approval.")
      .autonomousLimit,
  ).toBe(0);
});
it("takes the lowest of conflicting automatic spending limits", () => {
  expect(explicitAutonomousLimit("Automatically purchase up to $600. Autonomous limit $500.")).toBe(
    500,
  );
});
it("rejects model output that invents or increases automatic spending", () => {
  expect(() => validateIntentPermissions("Buy 3 new monitors under $700.", DEMO_POLICY)).toThrow();
  expect(() =>
    validateIntentPermissions(DEFAULT_INTENT, { ...DEMO_POLICY, autonomousLimit: 650 }),
  ).toThrow();
  expect(() =>
    validateIntentPermissions(DEFAULT_INTENT, { ...DEMO_POLICY, requireHumanApprovalAbove: 650 }),
  ).toThrow();
  expect(() =>
    validateIntentPermissions(DEFAULT_INTENT, { ...DEMO_POLICY, maxTotal: 800 }),
  ).toThrow();
  expect(() => validateIntentPermissions(DEFAULT_INTENT, DEMO_POLICY)).not.toThrow();
});
