import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as aktivirajPin } from "@/app/api/administracija/pin/route";
import { GET as pregledOsoblja } from "@/app/api/administracija/zaposlenici/route";
import { POST as postaviPin } from "@/app/api/pin/route";
import { GET as imena, POST as prijava } from "@/app/api/prijava/route";
import { DELETE as odjava, GET as sesija } from "@/app/api/sesija/route";
import { GET as status } from "@/app/api/status/route";
import { ApiGreska, odgovorGreske, PoslovnaGreska } from "@/lib/api/greske";
import { KOLACIC_UREDJAJA } from "@/lib/auth/pinOgranicenje";
import { KOLACIC_SESIJE, opcijeKolacica } from "@/lib/auth/session";
import { demoBaza } from "@/lib/demo/store";
import { modAplikacije } from "@/lib/supabase/config";

const TAJNA = "t".repeat(43);
const SUPABASE = {
  SUPABASE_URL: "https://primjer.supabase.co",
  SUPABASE_SECRET_KEY: "tajni-kljuc",
};

describe("modAplikacije", () => {
  it("uses demo in development with no Supabase vars", () => {
    expect(modAplikacije({ NODE_ENV: "development" })).toBe("demo");
  });

  it("treats empty values as unset", () => {
    expect(modAplikacije({ NODE_ENV: "development", SUPABASE_SECRET_KEY: "" })).toBe("demo");
  });

  it("uses supabase when all vars are set", () => {
    expect(modAplikacije({ NODE_ENV: "development", ...SUPABASE })).toBe("supabase");
    expect(modAplikacije({ NODE_ENV: "production", SESSION_SECRET: TAJNA, ...SUPABASE })).toBe("supabase");
  });

  it("rejects a partial Supabase config in any environment", () => {
    const djelimicno = { SUPABASE_SECRET_KEY: "tajni-kljuc" };
    expect(modAplikacije({ NODE_ENV: "development", ...djelimicno })).toBe("misconfigured");
    expect(modAplikacije({ NODE_ENV: "production", SESSION_SECRET: TAJNA, ...djelimicno })).toBe("misconfigured");
  });

  it("never falls back to demo in production", () => {
    expect(modAplikacije({ NODE_ENV: "production", SESSION_SECRET: TAJNA })).toBe("misconfigured");
  });

  it("rejects production with a missing or short session secret", () => {
    expect(modAplikacije({ NODE_ENV: "production", ...SUPABASE })).toBe("misconfigured");
    expect(modAplikacije({ NODE_ENV: "production", SESSION_SECRET: "kratka", ...SUPABASE })).toBe("misconfigured");
  });
});

describe("GET /api/status", () => {
  afterEach(() => vi.unstubAllEnvs());

  function stubEnv(vrijednosti: Record<string, string>) {
    for (const ime of [...Object.keys(SUPABASE), "SESSION_SECRET"]) vi.stubEnv(ime, "");
    for (const [ime, vrijednost] of Object.entries(vrijednosti)) vi.stubEnv(ime, vrijednost);
  }

  it("returns 200 and the mode when configured", async () => {
    stubEnv({ NODE_ENV: "production", SESSION_SECRET: TAJNA, ...SUPABASE });

    const odgovor = status();

    expect(odgovor.status).toBe(200);
    expect(await odgovor.json()).toEqual({ ok: true, mod: "supabase" });
    expect(odgovor.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 503 when misconfigured, naming no variable", async () => {
    stubEnv({ NODE_ENV: "production", SUPABASE_SECRET_KEY: "tajni-kljuc" });

    const odgovor = status();

    expect(odgovor.status).toBe(503);
    expect(await odgovor.json()).toEqual({ ok: false, mod: "misconfigured" });
  });
});

describe("odgovorGreske", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows business errors", async () => {
    const odgovor = odgovorGreske(new PoslovnaGreska("Izaberite drugi PIN."));
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Izaberite drugi PIN." });
  });

  it("recognises a Postgres business error by its code", async () => {
    const odgovor = odgovorGreske({ code: "P0001", message: "Poruka iz baze." });
    expect(odgovor.status).toBe(422);
    expect(await odgovor.json()).toEqual({ greska: "Poruka iz baze." });
  });

  it("hides every other error behind a generic message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const odgovor = odgovorGreske({ code: "42P01", message: 'relation "tajna_tabela" does not exist' });
    expect(odgovor.status).toBe(500);
    expect(await odgovor.text()).not.toContain("tajna_tabela");
  });

  it("keeps the status and headers of an API error", () => {
    const odgovor = odgovorGreske(new ApiGreska(429, "Sačekajte.", { "Retry-After": "60" }));
    expect(odgovor.status).toBe(429);
    expect(odgovor.headers.get("Retry-After")).toBe("60");
  });
});

describe("opcijeKolacica", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("marks cookies secure only in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(opcijeKolacica(60)).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 });
    vi.stubEnv("NODE_ENV", "development");
    expect(opcijeKolacica(60).secure).toBe(false);
  });
});

describe("PIN login and activation (real SQL on PGlite)", () => {
  const PIN_SEFICE = "4827";
  const PIN_KONOBARA = "5930";

  beforeEach(async () => {
    vi.stubEnv("DEMO_BAZA", "memory://");
    vi.stubEnv("SESSION_SECRET", TAJNA);
    for (const ime of Object.keys(SUPABASE)) vi.stubEnv(ime, "");
    vi.spyOn(console, "info").mockImplementation(() => {});

    // New ids each test, because the 30 s active-employee cache is keyed by id.
    const db = await demoBaza();
    await db.exec(`
      delete from public.dnevnik_radnji;
      delete from public.pin_pokusaji;
      update public.zaposlenici
      set id = gen_random_uuid(), pin_hash = null, aktivacija_hash = null, aktivacija_do = null, aktivan = true;
    `);
  }, 60_000);

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function zahtjev(
    url: string,
    opcije: { metoda?: string; tijelo?: unknown; kolacici?: (string | undefined)[]; ip?: string } = {},
  ) {
    return new NextRequest(`http://localhost${url}`, {
      method: opcije.metoda ?? "GET",
      body: opcije.tijelo === undefined ? undefined : JSON.stringify(opcije.tijelo),
      headers: {
        cookie: (opcije.kolacici ?? []).filter(Boolean).join("; "),
        "x-real-ip": opcije.ip ?? "10.0.0.1",
      },
    });
  }

  function postJson(url: string, tijelo: unknown, opcije: { kolacici?: (string | undefined)[]; ip?: string } = {}) {
    return zahtjev(url, { metoda: "POST", tijelo, ...opcije });
  }

  function setCookie(odgovor: Response, ime: string) {
    return odgovor.headers.getSetCookie().find((k) => k.startsWith(`${ime}=`));
  }

  function kolacic(odgovor: Response, ime: string) {
    return setCookie(odgovor, ime)?.split(";")[0];
  }

  async function prviKod() {
    const { rows } = await (await demoBaza()).query<{ kod: string }>("select public.aktiviraj_prvu_seficu() as kod");
    return rows[0].kod;
  }

  async function prijaviSeficu() {
    await postaviPin(postJson("/api/pin", { kod: await prviKod(), noviPin: PIN_SEFICE }));
    const odgovor = await prijava(postJson("/api/prijava", { uloga: "sefica", pin: PIN_SEFICE }));
    expect(odgovor.status).toBe(200);
    return kolacic(odgovor, KOLACIC_SESIJE);
  }

  async function idPoImenu(sefica: string | undefined, ime: string) {
    const odgovor = await pregledOsoblja(zahtjev("/api/administracija/zaposlenici", { kolacici: [sefica] }));
    const { zaposlenici } = (await odgovor.json()) as { zaposlenici: { id: string; ime: string }[] };
    return zaposlenici.find((z) => z.ime === ime)!.id;
  }

  async function prijaviKonobara(sefica: string | undefined) {
    const id = await idPoImenu(sefica, "Emsud Peco");
    const aktivacija = await aktivirajPin(postJson("/api/administracija/pin", { zaposlenikId: id }, { kolacici: [sefica] }));
    const { kod } = (await aktivacija.json()) as { kod: string };
    await postaviPin(postJson("/api/pin", { kod, noviPin: PIN_KONOBARA }));
    const odgovor = await prijava(postJson("/api/prijava", { uloga: "konobar", zaposlenikId: id, pin: PIN_KONOBARA }));
    expect(odgovor.status).toBe(200);
    return { id, kolacic: kolacic(odgovor, KOLACIC_SESIJE) };
  }

  it("lets the manager choose a first PIN with the code, then log in", async () => {
    const odgovor = await postaviPin(postJson("/api/pin", { kod: await prviKod(), noviPin: PIN_SEFICE }));
    expect(odgovor.status).toBe(200);

    const prijavljena = await prijava(postJson("/api/prijava", { uloga: "sefica", pin: PIN_SEFICE }));
    expect(prijavljena.status).toBe(200);
    expect(await prijavljena.json()).toEqual({ ime: "Nedžija Smajić", uloga: "sefica", pocetna: "/sefica" });

    const postavljen = setCookie(prijavljena, KOLACIC_SESIJE)!;
    expect(postavljen).toMatch(/HttpOnly/i);
    expect(postavljen).toMatch(/SameSite=lax/i);
    expect(postavljen).toMatch(/Max-Age=64800/);
  });

  it("uses an activation code only once", async () => {
    const kod = await prviKod();
    await postaviPin(postJson("/api/pin", { kod, noviPin: PIN_SEFICE }));
    const ponovo = await postaviPin(postJson("/api/pin", { kod, noviPin: "6142" }));
    expect(ponovo.status).toBe(401);
  });

  it("rejects a weak new PIN without using up the code", async () => {
    const kod = await prviKod();
    for (const slab of ["1111", "1234", "2580", "1987"]) {
      expect((await postaviPin(postJson("/api/pin", { kod, noviPin: slab }))).status).toBe(422);
    }
    expect((await postaviPin(postJson("/api/pin", { kod, noviPin: PIN_SEFICE }))).status).toBe(200);
  });

  it("does not let two people in a role share a PIN", async () => {
    const sefica = await prijaviSeficu();
    await prijaviKonobara(sefica);

    const id = await idPoImenu(sefica, "Gasal Mirza");
    const aktivacija = await aktivirajPin(postJson("/api/administracija/pin", { zaposlenikId: id }, { kolacici: [sefica] }));
    const { kod } = (await aktivacija.json()) as { kod: string };

    const odgovor = await postaviPin(postJson("/api/pin", { kod, noviPin: PIN_KONOBARA }));
    expect(odgovor.status).toBe(422);
  });

  it("logs a waiter in with name and PIN, and lists only staff who have a PIN", async () => {
    const sefica = await prijaviSeficu();
    const { id } = await prijaviKonobara(sefica);

    const lista = await (await imena(zahtjev("/api/prijava?uloga=konobar"))).json();
    expect(lista).toEqual({ saImenom: true, zaposlenici: [{ id, ime: "Emsud Peco" }] });

    const bezImena = await prijava(postJson("/api/prijava", { uloga: "konobar", pin: PIN_KONOBARA }));
    expect(bezImena.status).toBe(400);
  });

  it("returns no names for sections that log in with the PIN alone", async () => {
    await prijaviSeficu();
    const lista = await (await imena(zahtjev("/api/prijava?uloga=sefica"))).json();
    expect(lista).toEqual({ saImenom: false, zaposlenici: [] });
  });

  it("lets waiters and the manager open the bar with their own PIN, but nobody else", async () => {
    const sefica = await prijaviSeficu();
    const { id } = await prijaviKonobara(sefica);

    const konobar = await prijava(postJson("/api/prijava", { uloga: "sank", zaposlenikId: id, pin: PIN_KONOBARA }));
    expect(konobar.status).toBe(200);
    expect(await konobar.json()).toMatchObject({ uloga: "konobar", pocetna: "/sank" });

    const lista = (await (await imena(zahtjev("/api/prijava?uloga=sank"))).json()) as { zaposlenici: { ime: string }[] };
    expect(lista.zaposlenici.map((z) => z.ime)).toContain("Nedžija Smajić");

    const kuhinja = await prijava(postJson("/api/prijava", { uloga: "kuhinja", pin: PIN_KONOBARA }));
    expect(kuhinja.status).toBe(401);
  });

  it("locks a device after 5 wrong PINs, with Retry-After", async () => {
    await prijaviSeficu();
    let uredjaj: string | undefined;

    for (let i = 1; i <= 4; i++) {
      const odgovor = await prijava(postJson("/api/prijava", { uloga: "sefica", pin: "9999" }, { kolacici: [uredjaj] }));
      expect(odgovor.status).toBe(401);
      uredjaj ??= kolacic(odgovor, KOLACIC_UREDJAJA);
    }
    expect(uredjaj).toBeDefined();

    const peti = await prijava(postJson("/api/prijava", { uloga: "sefica", pin: "9999" }, { kolacici: [uredjaj] }));
    expect(peti.status).toBe(429);
    expect(Number(peti.headers.get("Retry-After"))).toBeGreaterThan(290);

    // Even the right PIN waits, and another device on another network is unaffected.
    const tacan = await prijava(postJson("/api/prijava", { uloga: "sefica", pin: PIN_SEFICE }, { kolacici: [uredjaj] }));
    expect(tacan.status).toBe(429);
    const drugi = await prijava(postJson("/api/prijava", { uloga: "sefica", pin: PIN_SEFICE }, { ip: "10.0.0.2" }));
    expect(drugi.status).toBe(200);
  });

  it("locks an IP after 20 wrong PINs, even when the device cookie is dropped", async () => {
    let zadnji: Response | undefined;
    for (let i = 1; i <= 20; i++) {
      zadnji = await prijava(postJson("/api/prijava", { uloga: "kuhinja", pin: "9999" }));
      expect(zadnji.status).toBe(i < 20 ? 401 : 429);
    }
    expect(Number(zadnji!.headers.get("Retry-After"))).toBeGreaterThan(890);
  }, 30_000);

  it("locks everyone after 100 wrong PINs from many IPs", async () => {
    for (let i = 1; i <= 100; i++) {
      const odgovor = await prijava(postJson("/api/prijava", { uloga: "kuhinja", pin: "9999" }, { ip: `10.1.0.${i}` }));
      expect(odgovor.status).toBe(i < 100 ? 401 : 429);
    }
  }, 30_000);

  it("counts wrong activation codes towards the lockout", async () => {
    await prviKod();
    let uredjaj: string | undefined;
    let zadnji: Response | undefined;
    for (let i = 1; i <= 5; i++) {
      zadnji = await postaviPin(postJson("/api/pin", { kod: "000000", noviPin: PIN_SEFICE }, { kolacici: [uredjaj] }));
      uredjaj ??= kolacic(zadnji, KOLACIC_UREDJAJA);
    }
    expect(zadnji!.status).toBe(429);
  });

  it.each([
    ["an unknown field", { uloga: "sefica", pin: "4827", cijena: 1 }],
    ["a non-numeric PIN", { uloga: "sefica", pin: "abcd" }],
    ["a short PIN", { uloga: "sefica", pin: "123" }],
    ["a long PIN", { uloga: "sefica", pin: "123456789" }],
    ["an unknown role", { uloga: "direktor", pin: "4827" }],
    ["a bad employee id", { uloga: "konobar", zaposlenikId: "1", pin: "4827" }],
  ])("rejects %s with 400", async (_opis, tijelo) => {
    expect((await prijava(postJson("/api/prijava", tijelo))).status).toBe(400);
  });

  it("rejects a body that is not JSON", async () => {
    const odgovor = await prijava(
      new NextRequest("http://localhost/api/prijava", { method: "POST", body: "nije json" }),
    );
    expect(odgovor.status).toBe(400);
  });

  it("returns 503 on login when no session secret is set", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    const odgovor = await prijava(postJson("/api/prijava", { uloga: "sefica", pin: "4827" }));
    expect(odgovor.status).toBe(503);
  });

  it("reports the session, and 401 without one", async () => {
    const sefica = await prijaviSeficu();
    const odgovor = await sesija(zahtjev("/api/sesija", { kolacici: [sefica] }));
    expect(await odgovor.json()).toEqual({ ime: "Nedžija Smajić", uloga: "sefica" });
    expect((await sesija(zahtjev("/api/sesija"))).status).toBe(401);
  });

  it("expires the session after 18 hours", async () => {
    const sefica = await prijaviSeficu();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 18 * 60 * 60 * 1000 + 1000);
    expect((await sesija(zahtjev("/api/sesija", { kolacici: [sefica] }))).status).toBe(401);
  });

  it("rejects a deactivated employee once the 30 s cache runs out", async () => {
    const sefica = await prijaviSeficu();
    expect((await sesija(zahtjev("/api/sesija", { kolacici: [sefica] }))).status).toBe(200);

    await (await demoBaza()).exec("update public.zaposlenici set aktivan = false where uloga = 'sefica'");
    expect((await sesija(zahtjev("/api/sesija", { kolacici: [sefica] }))).status).toBe(200);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 31_000);
    expect((await sesija(zahtjev("/api/sesija", { kolacici: [sefica] }))).status).toBe(401);

    const ponovo = await prijava(postJson("/api/prijava", { uloga: "sefica", pin: PIN_SEFICE }, { ip: "10.0.0.3" }));
    expect(ponovo.status).toBe(401);
  });

  it("clears the session on logout", async () => {
    const odgovor = await odjava();
    expect(setCookie(odgovor, KOLACIC_SESIJE)).toMatch(/Max-Age=0/);
  });

  it("keeps staff administration for the manager, and never returns hashes", async () => {
    const sefica = await prijaviSeficu();
    const { id, kolacic: konobar } = await prijaviKonobara(sefica);

    expect((await pregledOsoblja(zahtjev("/api/administracija/zaposlenici"))).status).toBe(401);
    expect((await pregledOsoblja(zahtjev("/api/administracija/zaposlenici", { kolacici: [konobar] }))).status).toBe(403);
    expect(
      (await aktivirajPin(postJson("/api/administracija/pin", { zaposlenikId: id }, { kolacici: [konobar] }))).status,
    ).toBe(403);

    const tekst = await (await pregledOsoblja(zahtjev("/api/administracija/zaposlenici", { kolacici: [sefica] }))).text();
    expect(tekst).toContain("Emsud Peco");
    expect(tekst).not.toMatch(/hash|pinHash|kodHash/i);
  });
});
