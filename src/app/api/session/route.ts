import { NextResponse } from "next/server";
import { z } from "zod";
import { api, body, errorResponse, validateOrigin } from "@/lib/http";
import { sessionCookie, localDemo } from "@/lib/security/auth";
import { rateLimiter } from "@/lib/security/rate-limit";
import { paymentMode } from "@/lib/paypal/gateway";
import { aiMode } from "@/lib/ai/provider";
import { validateEnvironment } from "@/lib/environment";
import { loginRateLimitKey } from "@/lib/security/login-identity";
import { appUrl } from "@/lib/config";
export const GET = api(async (r, user) => ({
  userId: user,
  name: "Workspace operator",
  mode: paymentMode(),
  demoMode: process.env.DEMO_MODE === "true",
  aiMode: aiMode(),
  localDemo: localDemo(r),
}));
export async function POST(r: Request) {
  try {
    validateEnvironment();
    validateOrigin(r);
    rateLimiter.check(loginRateLimitKey(r), 5, 60000);
    const { password } = await body(r, z.object({ password: z.string().max(256) }).strict());
    return NextResponse.json(
      { ok: true },
      { headers: { "Set-Cookie": sessionCookie(password), "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(r: Request) {
  return api(async () => ({ ok: true }))(r).then((response) => {
    response.headers.set(
      "Set-Cookie",
      `agentguard_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${appUrl().startsWith("https:") ? "; Secure" : ""}`,
    );
    return response;
  });
}
