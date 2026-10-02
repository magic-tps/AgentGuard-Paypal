import { AppError } from "../domain/errors";
// Single-process implementation behind an interface; replace with shared storage for multiple instances.
export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): void;
}
const buckets = new Map<string, { count: number; until: number }>();
export const rateLimiter: RateLimiter = {
  check(key, limit, windowMs) {
    const now = Date.now();
    for (const [k, v] of buckets) if (v.until < now) buckets.delete(k);
    const bucket = buckets.get(key) ?? { count: 0, until: now + windowMs };
    if (bucket.count >= limit)
      throw new AppError("RATE_LIMITED", "Too many requests. Please retry in a minute.", 429);
    bucket.count++;
    buckets.set(key, bucket);
  },
};
