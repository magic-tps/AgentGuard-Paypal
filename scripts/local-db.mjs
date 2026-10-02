import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
const databaseDir = path.resolve(".data/postgres");
mkdirSync(path.dirname(databaseDir), { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir,
  user: "agentguard",
  password: "agentguard_local",
  port: 54329,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: (message) => {
    if (String(message).includes("FATAL")) console.error(String(message));
  },
});
if (!existsSync(path.join(databaseDir, "PG_VERSION"))) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const result = await client.query("SELECT 1 FROM pg_database WHERE datname = 'agentguard'");
if (result.rowCount === 0) await client.query("CREATE DATABASE agentguard");
await client.end();
console.log(
  "AgentGuard PostgreSQL is ready on 127.0.0.1:54329. Keep this terminal open. Data persists in .data/postgres.",
);
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 60000);
