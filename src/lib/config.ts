import "server-only";

export function appUrl() {
  // Reflect avoids build-time inlining, including Turbopack's optimization of aliases.
  const value: unknown = Reflect.get(process.env, "NEXT_PUBLIC_APP_URL");
  return typeof value === "string" ? value : "http://localhost:3000";
}
