import { afterEach, expect, it, vi } from "vitest";
import { GET as health } from "../src/app/api/health/route";
import { DELETE as logout } from "../src/app/api/session/route";
import { sessionCookie } from "../src/lib/security/auth";

afterEach(() => vi.unstubAllEnvs());
function remoteEnvironment() {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://agentguard.example");
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://operator:placeholder@database.example/agentguard?sslmode=require",
  );
  vi.stubEnv("AI_PROVIDER", "deterministic");
  vi.stubEnv("DEMO_MODE", "true");
  vi.stubEnv("OPERATOR_PASSWORD", "test-operator-password");
  vi.stubEnv("SESSION_SECRET", "test-session-secret-with-at-least-thirty-two-characters");
}
it("keeps operator health protected for public requests with demo fallback enabled", async () => {
  remoteEnvironment();
  const response = await health(new Request("https://agentguard.example/api/health"));
  expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
});
it("logout expires the browser session with restrictive HTTPS cookie attributes", async () => {
  remoteEnvironment();
  const cookie = sessionCookie("test-operator-password");
  const response = await logout(
    new Request("https://agentguard.example/api/session", {
      method: "DELETE",
      headers: {
        Cookie: cookie,
        Origin: "https://agentguard.example",
        "Content-Type": "application/json",
      },
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Set-Cookie")).toBe(
    "agentguard_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Secure",
  );
  const signedOut = await health(new Request("https://agentguard.example/api/health"));
  expect(signedOut.status).toBe(401);
});
