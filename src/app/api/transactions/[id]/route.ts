import { api, uuid, type RouteContext } from "@/lib/http";
import { db } from "@/lib/db";
import { ownedTransaction, serializeTransaction } from "@/lib/services/transaction-store";
export async function GET(r: Request, c: RouteContext) {
  const { id } = await c.params;
  return api(async (_r, user) =>
    serializeTransaction(await ownedTransaction(db, uuid.parse(id), user)),
  )(r);
}
