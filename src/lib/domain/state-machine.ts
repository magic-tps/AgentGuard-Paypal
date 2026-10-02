import type { TransactionStatus } from "@prisma/client";
import { AppError } from "./errors";
const transitions: Record<TransactionStatus, readonly TransactionStatus[]> = {
  DRAFT: ["POLICY_CHECKED"],
  POLICY_CHECKED: ["BLOCKED", "REQUIRES_APPROVAL", "PAYPAL_ORDER_CREATED"],
  BLOCKED: [],
  REQUIRES_APPROVAL: ["APPROVED", "BLOCKED"],
  APPROVED: ["PAYPAL_ORDER_CREATED", "BLOCKED", "REQUIRES_APPROVAL"],
  PAYPAL_ORDER_CREATED: ["PAYER_APPROVED", "BLOCKED", "REQUIRES_APPROVAL", "FAILED"],
  PAYER_APPROVED: ["AUTHORIZED", "FAILED"],
  AUTHORIZED: ["FINAL_POLICY_CHECK", "VOIDED"],
  FINAL_POLICY_CHECK: ["CAPTURED", "VOIDED", "FAILED"],
  CAPTURED: [],
  VOIDED: [],
  FAILED: [],
};
export function assertTransition(from: TransactionStatus, to: TransactionStatus) {
  if (!transitions[from].includes(to))
    throw new AppError("INVALID_TRANSITION", `Cannot move a ${from} transaction to ${to}.`, 409);
}
export const terminalStatuses: TransactionStatus[] = ["CAPTURED", "VOIDED", "BLOCKED", "FAILED"];
export const reservedStatuses: TransactionStatus[] = [
  "PAYPAL_ORDER_CREATED",
  "PAYER_APPROVED",
  "AUTHORIZED",
  "FINAL_POLICY_CHECK",
  "CAPTURED",
];
