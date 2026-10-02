import "server-only";
import { db, json } from "../db";
import { AppError } from "../domain/errors";
import { compilePolicy } from "../ai/policy-compiler";
import { spendingMandateSchema, type SpendingPolicy } from "../domain/schemas";
import { audit, lockMandate } from "./transaction-store";
export const mandateInclude = {
  versions: { orderBy: { version: "desc" as const } },
  audits: { orderBy: { createdAt: "asc" as const } },
};
export async function compileMandate(userId: string, intent: string, name: string) {
  const compiled = await compilePolicy(intent);
  return db.$transaction(async (tx) => {
    const mandate = await tx.spendingMandate.create({
      data: {
        userId,
        name,
        originalIntent: intent,
        versions: {
          create: {
            version: 1,
            policy: json(compiled.policy),
            originalIntent: intent,
            model: compiled.model,
          },
        },
      },
      include: mandateInclude,
    });
    await audit(tx, "MANDATE_CREATED", userId, { name }, undefined, mandate.id);
    await audit(
      tx,
      "MANDATE_COMPILED",
      "policy-compiler",
      { model: compiled.model, aiMode: compiled.aiMode, simulated: compiled.simulated, version: 1 },
      undefined,
      mandate.id,
    );
    return { ...mandate, policy: compiled.policy, simulated: compiled.simulated };
  });
}
export async function changeMandate(
  userId: string,
  id: string,
  action: "activate" | "deactivate" | "clone" | "edit",
  input: { confirmed?: boolean; policy?: SpendingPolicy; name?: string; expectedVersion: number },
) {
  return db.$transaction(async (tx) => {
    await lockMandate(tx, id);
    const m = await tx.spendingMandate.findFirst({
      where: { id, userId },
      include: mandateInclude,
    });
    if (!m) throw new AppError("NOT_FOUND", "Mandate not found.", 404);
    if (m.version !== input.expectedVersion)
      throw new AppError("POLICY_CHANGED", "Policy changed. Reload it before confirming.", 409);
    const current = m.versions[0];
    if (action === "clone") {
      const clone = await tx.spendingMandate.create({
        data: {
          userId,
          name: `${m.name} · copy`,
          originalIntent: m.originalIntent,
          versions: {
            create: {
              version: 1,
              policy: json(current.policy),
              model: "human-clone",
              originalIntent: m.originalIntent,
            },
          },
        },
        include: mandateInclude,
      });
      await audit(tx, "MANDATE_CREATED", userId, { clonedFrom: id }, undefined, clone.id);
      return clone;
    }
    if (action === "activate" && !input.confirmed)
      throw new AppError(
        "CONFIRMATION_REQUIRED",
        "Explicit human confirmation is required before activation.",
        422,
      );
    if (action === "edit") {
      const policy = spendingMandateSchema.parse(input.policy);
      const version = m.version + 1;
      await tx.policyVersion.create({
        data: {
          mandateId: id,
          version,
          policy: json(policy),
          originalIntent: m.originalIntent,
          model: "human-edited",
        },
      });
      await tx.spendingMandate.update({
        where: { id },
        data: { name: input.name ?? m.name, version, status: "DRAFT" },
      });
    } else {
      await tx.spendingMandate.update({
        where: { id },
        data: { status: action === "activate" ? "ACTIVE" : "INACTIVE" },
      });
      if (action === "activate")
        await tx.policyVersion.update({
          where: { id: current.id },
          data: { confirmedAt: new Date() },
        });
    }
    await audit(
      tx,
      action === "activate"
        ? "MANDATE_ACTIVATED"
        : action === "deactivate"
          ? "MANDATE_DEACTIVATED"
          : "MANDATE_EDITED",
      userId,
      { version: action === "edit" ? m.version + 1 : m.version },
      undefined,
      id,
    );
    return tx.spendingMandate.findUniqueOrThrow({ where: { id }, include: mandateInclude });
  });
}
