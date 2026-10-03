import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

const listed = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
);
const files = [...new Set(listed.split("\0").filter(Boolean))];
const local = existsSync(".env") ? parse(readFileSync(".env")) : {};
const keys = [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "SESSION_SECRET",
  "OPERATOR_PASSWORD",
  "OPENAI_API_KEY",
  "PAYPAL_WEBHOOK_ID",
];
const configuredSecrets = keys
  .map((key) => local[key] || process.env[key])
  .filter((value) => value && value.length >= 8);
const issues = new Set();
for (const file of files) {
  if (!existsSync(file)) continue;
  if (/(^|\/)(\.env(?:\..*)?|\.data)(\/|$)/.test(file) && !file.endsWith(".env.example")) {
    issues.add(file);
    continue;
  }
  if (/\.(png|jpg|ico|woff2?)$/i.test(file)) continue;
  const contents = readFileSync(file, "utf8");
  if (configuredSecrets.some((value) => contents.includes(value))) issues.add(file);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(contents)) issues.add(file);
  if (/\bBearer\s+[A-Za-z0-9_-]{30,}/.test(contents)) issues.add(file);
  for (const match of contents.matchAll(/postgres(?:ql)?:\/\/[^\s"'`<>]+/g)) {
    try {
      const url = new URL(match[0]);
      if (
        url.password &&
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        !/placeholder|example|YOUR_|<|\$\{|%3C/i.test(url.password)
      )
        issues.add(file);
    } catch {
      /* Documentation placeholders are not valid connection strings. */
    }
  }
}
try {
  execFileSync("git", ["check-ignore", "-q", ".env"]);
} catch {
  issues.add(".env");
}
if (issues.size) {
  for (const file of issues) console.log(`POTENTIAL SECRET FOUND IN ${file} (value redacted)`);
  process.exitCode = 1;
} else console.log("SAFE");
