import "dotenv/config";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
if (!process.env.DATABASE_URL) {
  console.error("FAIL: DATABASE_URL must be configured. No values disclosed.");
  process.exitCode = 1;
} else {
  // Capture Prisma's datasource/error output so connection details are never printed.
  execFile(
    process.execPath,
    [require.resolve("prisma/build/index.js"), "migrate", "deploy"],
    { env: process.env, maxBuffer: 4 * 1024 * 1024 },
    (error) => {
      if (error) {
        console.error(
          "FAIL: migration deployment failed. Check connectivity and migration state securely. No values disclosed.",
        );
        process.exitCode = 1;
      } else
        console.log(
          "PASS: Prisma migrate deploy completed. Existing data preserved; seed not executed.",
        );
    },
  );
}
