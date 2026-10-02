import { afterEach, expect, it, vi } from "vitest";
import { authenticatedUser, localDemo, sessionCookie } from "../src/lib/security/auth";
import { DEMO_USER_ID } from "../src/lib/domain/demo";

afterEach(() => vi.unstubAllEnvs());
function protectedEnvironment() {
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://agentguard.example");
  vi.stubEnv("OPERATOR_PASSWORD", "test-operator-password");
  vi.stubEnv("SESSION_SECRET", "test-session-secret-with-at-least-thirty-two-characters");
}
it("signs an expiring HttpOnly secure operator session", () => {
  protectedEnvironment();
  const cookie = sessionCookie("test-operator-password");
  expect(cookie).toContain("HttpOnly; SameSite=Strict; Path=/; Max-Age=28800; Secure");
  expect(cookie).not.toContain("test-operator-password");
  expect(cookie).not.toContain(process.env.SESSION_SECRET);
  expect(
    authenticatedUser(
      new Request("https://agentguard.example/api/session", { headers: { Cookie: cookie } }),
    ),
  ).toBe(DEMO_USER_ID);
});
it("rejects invalid credentials, modified signatures and expired sessions", () => {
  protectedEnvironment();
  expect(() => sessionCookie("wrong-password")).toThrow();
  const cookie = sessionCookie("test-operator-password").split(";")[0];
  expect(() =>
    authenticatedUser(
      new Request("https://agentguard.example/api/session", {
        headers: { Cookie: cookie + "tampered" },
      }),
    ),
  ).toThrow();
  expect(() =>
    authenticatedUser(
      new Request("https://agentguard.example/api/session", {
        headers: { Cookie: cookie.replace(/\.\d+\./, ".1.") },
      }),
    ),
  ).toThrow();
});
it("fails clearly when session protection is not configured", () => {
  protectedEnvironment();
  vi.stubEnv("SESSION_SECRET", "");
  expect(() => sessionCookie("test-operator-password")).toThrow("Configure");
});
it("allows explicit loopback demo access and requires a session remotely", () => {
  vi.stubEnv("DEMO_MODE", "true");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  expect(authenticatedUser(new Request("http://localhost:3000/api/session"))).toBe(DEMO_USER_ID);
  expect(localDemo(new Request("https://agentguard.example/api/session"))).toBe(false);
  expect(() => authenticatedUser(new Request("https://agentguard.example/api/session"))).toThrow(
    "Sign in",
  );
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://agentguard.example");
  expect(localDemo(new Request("http://localhost:3000/api/session"))).toBe(false);
});
