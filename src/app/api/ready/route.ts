import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateEnvironment } from "@/lib/environment";
import { DEMO_USER_ID } from "@/lib/domain/demo";

export const dynamic = "force-dynamic";

// Public readiness reveals no configuration and makes no payment/inference calls.
export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    validateEnvironment();
    const operator = await Promise.race([
      db.user.findUnique({ where: { id: DEMO_USER_ID }, select: { id: true } }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Readiness timeout")), 3000);
      }),
    ]);
    if (!operator) throw new Error("Initial database setup required");
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}
