import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/status/route";
import { modAplikacije } from "@/lib/supabase/config";

// connection() needs a live Next.js request, which a unit test does not have.
vi.mock("next/server", () => ({ connection: async () => {} }));

const SUPABASE = {
  NEXT_PUBLIC_SUPABASE_URL: "https://primjer.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "javni-kljuc",
  SUPABASE_SECRET_KEY: "tajni-kljuc",
};

describe("modAplikacije", () => {
  it("uses demo in development with no Supabase vars", () => {
    expect(modAplikacije({ NODE_ENV: "development" })).toBe("demo");
  });

  it("treats empty values as unset", () => {
    expect(
      modAplikacije({ NODE_ENV: "development", SUPABASE_SECRET_KEY: "" }),
    ).toBe("demo");
  });

  it("uses supabase when all vars are set", () => {
    expect(modAplikacije({ NODE_ENV: "development", ...SUPABASE })).toBe("supabase");
    expect(
      modAplikacije({ NODE_ENV: "production", SESSION_SECRET: "s", ...SUPABASE }),
    ).toBe("supabase");
  });

  it("rejects a partial Supabase config in any environment", () => {
    const djelimicno = { SUPABASE_SECRET_KEY: "tajni-kljuc" };
    expect(modAplikacije({ NODE_ENV: "development", ...djelimicno })).toBe("misconfigured");
    expect(
      modAplikacije({ NODE_ENV: "production", SESSION_SECRET: "s", ...djelimicno }),
    ).toBe("misconfigured");
  });

  it("never falls back to demo in production", () => {
    expect(modAplikacije({ NODE_ENV: "production", SESSION_SECRET: "s" })).toBe("misconfigured");
  });

  it("rejects production with no session secret", () => {
    expect(modAplikacije({ NODE_ENV: "production", ...SUPABASE })).toBe("misconfigured");
  });
});

describe("GET /api/status", () => {
  afterEach(() => vi.unstubAllEnvs());

  function stubEnv(vrijednosti: Record<string, string>) {
    for (const ime of [...Object.keys(SUPABASE), "SESSION_SECRET"]) vi.stubEnv(ime, "");
    for (const [ime, vrijednost] of Object.entries(vrijednosti)) vi.stubEnv(ime, vrijednost);
  }

  it("returns 200 and the mode when configured", async () => {
    stubEnv({ NODE_ENV: "production", SESSION_SECRET: "tajna-sesije", ...SUPABASE });

    const odgovor = await GET();

    expect(odgovor.status).toBe(200);
    expect(await odgovor.json()).toEqual({ ok: true, mod: "supabase" });
    expect(odgovor.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 503 when misconfigured, naming no variable", async () => {
    stubEnv({ NODE_ENV: "production", SUPABASE_SECRET_KEY: "tajni-kljuc" });

    const odgovor = await GET();

    expect(odgovor.status).toBe(503);
    expect(await odgovor.json()).toEqual({ ok: false, mod: "misconfigured" });
  });
});
