import "dotenv/config";
import { db } from "../src/lib/db";
import { validateEnvironment } from "../src/lib/environment";
import { AppError } from "../src/lib/domain/errors";

async function main() {
  validateEnvironment(process.env, {
    publicDeployment: process.argv.includes("--public"),
    requireWebhook: process.argv.includes("--require-webhook"),
  });
  await db.$queryRaw`SELECT 1`;
  console.log("PASS: configuration valid; database reachable. No payment or inference executed.");
}
main()
  .catch((error: unknown) => {
    console.error(
      `FAIL: ${error instanceof AppError ? error.code : "DATABASE_UNAVAILABLE"}. No values disclosed.`,
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
