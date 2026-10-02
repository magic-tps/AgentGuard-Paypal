import "server-only";
import { PrismaClient, Prisma } from "@prisma/client";
const singleton = globalThis as unknown as { agentguardDb?: PrismaClient };
export const db = singleton.agentguardDb ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") singleton.agentguardDb = db;
export type DbTransaction = Prisma.TransactionClient;
export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
