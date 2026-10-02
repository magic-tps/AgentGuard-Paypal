import { createHash } from "node:crypto";
export function operationKey(transactionId: string, operation: string) {
  return createHash("sha256")
    .update(`agentguard:v1:${transactionId}:${operation}`)
    .digest("hex")
    .slice(0, 38);
}
