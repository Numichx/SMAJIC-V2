import { afterEach, expect, it, vi } from "vitest";
import { zovi } from "@/components/sefica/api";
import { pozovi } from "@/components/stanice/pozivi";

afterEach(() => vi.unstubAllGlobals());

// A poll that never answers would keep the in-flight guard set and freeze the station screen.
it("times out reads but lets writes wait for their answer", async () => {
  const pozivi: (RequestInit | undefined)[] = [];
  vi.stubGlobal("fetch", async (_a: string, opcije?: RequestInit) => {
    pozivi.push(opcije);
    return Response.json({});
  });
  await pozovi("/api/x", "/login");
  await zovi("/api/x");
  await pozovi("/api/x", "/login", "POST", {});
  await zovi("/api/x", "POST", {});
  expect(pozivi.map((o) => o?.signal instanceof AbortSignal)).toEqual([true, true, false, false]);
});

it("shows the no-connection message when a read times out", async () => {
  vi.stubGlobal("fetch", async () => {
    throw new DOMException("timeout", "TimeoutError");
  });
  expect(await pozovi("/api/x", "/login")).toEqual({ ok: false, greska: "Nema veze sa serverom. Pokušajte ponovo." });
});
