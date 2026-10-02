import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "../domain/errors";
import { DEMO_USER_ID } from "../domain/demo";
import { appUrl } from "../config";
const cookieName = "agentguard_session";
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32)
    throw new AppError(
      "AUTH_NOT_CONFIGURED",
      "Configure OPERATOR_PASSWORD and SESSION_SECRET (at least 32 characters) for protected access.",
      503,
    );
  return s;
}
function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function localDemo(request: Request) {
  const allowed = new URL(appUrl());
  const actual = new URL(request.url);
  return (
    process.env.DEMO_MODE === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(allowed.hostname) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(actual.hostname)
  );
}
export function authenticatedUser(request: Request) {
  if (localDemo(request)) return DEMO_USER_ID;
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  if (!value) throw new AppError("UNAUTHENTICATED", "Sign in as the workspace operator.", 401);
  const [id, expires, signature] = value.split(".");
  if (
    id !== DEMO_USER_ID ||
    !expires ||
    !signature ||
    Number(expires) < Date.now() ||
    !safeEqual(sign(`${id}.${expires}`), signature)
  )
    throw new AppError("UNAUTHENTICATED", "Your session expired. Sign in again.", 401);
  return id;
}
export function sessionCookie(password: string) {
  const expected = process.env.OPERATOR_PASSWORD;
  if (!expected || expected.length < 12)
    throw new AppError(
      "AUTH_NOT_CONFIGURED",
      "Set an operator password of at least 12 characters on the server.",
      503,
    );
  if (!safeEqual(password, expected))
    throw new AppError("INVALID_CREDENTIALS", "The operator password is incorrect.", 401);
  const payload = `${DEMO_USER_ID}.${Date.now() + 8 * 3600000}`;
  const secure = appUrl().startsWith("https:");
  return `${cookieName}=${payload}.${sign(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure ? "; Secure" : ""}`;
}
