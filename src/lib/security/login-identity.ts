import "server-only";
import { createHash } from "node:crypto";

// A future adapter must obtain identity from authenticated ingress/transport metadata,
// never directly from X-Forwarded-For or other caller-controlled headers.
export interface TrustedLoginIdentity {
  resolve(request: Request): string | undefined;
}

export function loginRateLimitKey(request: Request, trusted?: TrustedLoginIdentity) {
  const identity = trusted?.resolve(request);
  if (!identity) return "login:shared";
  return `login:trusted:${createHash("sha256").update(identity).digest("hex")}`;
}
