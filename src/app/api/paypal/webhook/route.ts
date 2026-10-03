import { NextResponse } from "next/server";
import { z } from "zod";
import { body, errorResponse } from "@/lib/http";
import { verifyWebhook, webhookSchema } from "@/lib/paypal/webhooks";
import { processVerifiedWebhook } from "@/lib/services/webhooks";
import { validateEnvironment } from "@/lib/environment";
export async function POST(request: Request) {
  try {
    validateEnvironment();
    const event = await body(request, z.unknown());
    webhookSchema.parse(event);
    await verifyWebhook(request.headers, event);
    return NextResponse.json(await processVerifiedWebhook(event));
  } catch (error) {
    return errorResponse(error);
  }
}
