import { z } from "zod";
import { api, body, uuid, type RouteContext } from "@/lib/http";
import { decideApproval } from "@/lib/services/purchases";
export async function POST(r: Request, c: RouteContext) {
  const { id } = await c.params;
  return api(async (req, user) => {
    await body(req, z.object({}).strict());
    return decideApproval(user, uuid.parse(id), false);
  })(r);
}
