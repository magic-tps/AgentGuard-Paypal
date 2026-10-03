import { afterEach, expect, it, vi } from "vitest";
import { loginRateLimitKey } from "../src/lib/security/login-identity";
afterEach(() => vi.unstubAllGlobals());

it("does not let spoofed forwarding headers select a fresh anonymous login bucket", () => {
  const request = (address: string) =>
    new Request("https://agentguard.example/api/session", {
      headers: {
        "X-Forwarded-For": address,
        "CF-Connecting-IP": address,
        "True-Client-IP": address,
      },
    });
  expect(loginRateLimitKey(request("192.0.2.1"))).toBe("login:shared");
  expect(loginRateLimitKey(request("192.0.2.2"))).toBe("login:shared");
});
it("supports an explicitly injected trusted identity adapter without exposing identity", () => {
  const request = new Request("https://agentguard.example/api/session");
  const key = loginRateLimitKey(request, { resolve: () => "transport-client-a" });
  expect(key).toMatch(/^login:trusted:[a-f0-9]{64}$/);
  expect(key).not.toContain("transport-client-a");
  expect(key).not.toBe(loginRateLimitKey(request, { resolve: () => "transport-client-b" }));
  expect(loginRateLimitKey(request, { resolve: () => undefined })).toBe("login:shared");
});
it("retains five attempts per minute and resets only after the time window", async () => {
  vi.resetModules();
  const { rateLimiter } = await import("../src/lib/security/rate-limit");
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
  try {
    for (let i = 0; i < 5; i++) rateLimiter.check("login:shared", 5, 60000);
    expect(() => rateLimiter.check("login:shared", 5, 60000)).toThrow("Too many");
    clock.mockReturnValue(61001);
    expect(() => rateLimiter.check("login:shared", 5, 60000)).not.toThrow();
  } finally {
    clock.mockRestore();
  }
});
