import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { demoBaza, demoRpc } from "@/lib/demo/store";

// The demo backend must behave like PostgREST on Supabase, or code that works here breaks there.
describe("demo backend", () => {
  const globalno = globalThis as typeof globalThis & { demoBaza?: unknown };
  const folder = mkdtempSync(path.join(tmpdir(), "smajic-demo-"));
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  let sefica: string;

  async function zatvori() {
    await (await demoBaza()).close();
    delete globalno.demoBaza;
  }

  beforeAll(async () => {
    // A parent folder that does not exist yet, as on a fresh install.
    vi.stubEnv("DEMO_BAZA", path.join(folder, "nema-jos", "baza"));
    const db = await demoBaza();
    const { rows } = await db.query<{ id: string }>("select id from public.zaposlenici where uloga = 'sefica'");
    sefica = rows[0].id;
  }, 60_000);

  afterEach(() => info.mockClear());

  afterAll(async () => {
    await zatvori();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  it("returns a table function as an array of plain objects", async () => {
    const pregled = (await demoRpc("zaposlenici_pregled", { p_sefica: sefica })) as Record<string, unknown>[];
    expect(pregled).toHaveLength(11);
    expect(Object.keys(pregled[0]).sort()).toEqual(["aktivan", "ceka_aktivaciju", "id", "ima_pin", "ime", "uloga"]);
  });

  it("returns a scalar function as its bare value", async () => {
    expect(await demoRpc("sesija_vazeca", { p_id: sefica, p_verzija: 1 })).toBe(true);
    expect(await demoRpc("aktiviraj_pin", { p_zaposlenik: sefica, p_sefica: sefica })).toMatch(/^[0-9]{6}$/);
  });

  it("passes arrays and nulls", async () => {
    const r = (await demoRpc("prijava_pinom", {
      p_uloge: ["konobar", "sefica"],
      p_zaposlenik: null,
      p_pin: "9999",
      p_uredjaj: "u",
      p_ip: "i",
    })) as { status: string }[];
    expect(r[0].status).toBe("pogresan");
  });

  it("throws business errors with their Postgres code and message", async () => {
    await expect(
      demoRpc("aktiviraj_pin", { p_zaposlenik: sefica, p_sefica: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toMatchObject({ code: "P0001", message: "Nemate pravo na ovu radnju." });
  });

  it("rolls back when a function raises", async () => {
    const db = await demoBaza();
    const broj = async () => (await db.query<{ n: number }>("select count(*)::int as n from public.dnevnik_radnji")).rows[0].n;
    const prije = await broj();
    await demoRpc("aktiviraj_pin", { p_zaposlenik: sefica, p_sefica: "00000000-0000-4000-8000-000000000000" }).catch(() => {});
    expect(await broj()).toBe(prije);
  });

  it("refuses wrong argument names, as PostgREST does", async () => {
    await expect(demoRpc("sesija_vazeca", { p_krivo: sefica })).rejects.toThrow(/Pogrešni argumenti/);
    await expect(demoRpc("sesija_vazeca", {})).rejects.toThrow(/Pogrešni argumenti/);
    await expect(demoRpc("nema_takve", {})).rejects.toThrow(/Nema funkcije/);
  });

  it("uses the app's real rights, so ungranted functions fail here too", async () => {
    await expect(demoRpc("aktiviraj_prvu_seficu", {})).rejects.toThrow(/permission denied/);
    await expect(demoRpc("pin_je_slab", { p_pin: "1234" })).rejects.toThrow(/permission denied/);
  });

  it("keeps its data on disk, applies migrations once, and stops printing a code once the manager has a PIN", async () => {
    const kod = (await demoRpc("aktiviraj_pin", { p_zaposlenik: sefica, p_sefica: sefica })) as string;
    await zatvori();

    await demoBaza();
    expect(info.mock.calls[0][0]).toMatch(/Aktivacijski kod za šeficu: [0-9]{6}/);
    expect(await demoRpc("sesija_vazeca", { p_id: sefica, p_verzija: 1 })).toBe(true);

    const novi = String(info.mock.calls[0][0]).match(/[0-9]{6}/)![0];
    const [postavljen] = (await demoRpc("postavi_pin_kodom", {
      p_kod: novi,
      p_novi_pin: "4827",
      p_uredjaj: "u9",
      p_ip: "i9",
    })) as { status: string }[];
    expect(postavljen.status).toBe("ok");
    expect(kod).not.toBe("");

    info.mockClear();
    await zatvori();
    await demoBaza();
    expect(info).not.toHaveBeenCalled();

    const [prijava] = (await demoRpc("prijava_pinom", {
      p_uloge: ["sefica"],
      p_zaposlenik: null,
      p_pin: "4827",
      p_uredjaj: "u9",
      p_ip: "i9",
    })) as { status: string; ime: string }[];
    expect(prijava).toMatchObject({ status: "ok", ime: "Nedžija Smajić" });
  }, 30_000);
});
