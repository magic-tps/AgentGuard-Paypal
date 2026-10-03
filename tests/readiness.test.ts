import { afterEach, expect, it, vi } from "vitest";
const lookup = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/db", () => ({ db: { user: { findUnique: lookup } } }));
import { GET } from "../src/app/api/ready/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  lookup.mockReset();
});

it("returns only a non-cacheable readiness status without authentication", async () => {
  lookup.mockResolvedValue({ id: "operator" });
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it.each([null, "failure"])(
  "returns 503 for an unseeded or unreachable database: %s",
  async (result) => {
    if (result === "failure") lookup.mockRejectedValue(new Error("private-database-url-secret"));
    else lookup.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  },
);
it("fails closed without disclosing invalid configuration or querying the database", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://private-user:private-secret@invalid.example");
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unavailable" });
  expect(lookup).not.toHaveBeenCalled();
});
it("returns 503 within the readiness deadline when the database stalls", async () => {
  vi.useFakeTimers();
  lookup.mockReturnValue(new Promise(() => {}));
  const pending = GET();
  await vi.advanceTimersByTimeAsync(3000);
  expect((await pending).status).toBe(503);
});
