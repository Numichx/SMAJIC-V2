import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { POST as narudzba } from "@/app/api/narudzbe/route";
import { POST as pin } from "@/app/api/pin/route";
import { POST as popust } from "@/app/api/racuni/[id]/popust/route";
import { POST as prijava } from "@/app/api/prijava/route";
import { demoBaza } from "@/lib/demo/store";
import { ocisti, osoblje, PIN_SEFICE, pripremiOkruzenje, postaviPin, proizvodi, zahtjev } from "./pomocnici";
import { racunStola } from "./pomocnici-faza5";

// On Vercel, checkBotId answers isBot for a script that skipped the app's page. Locally it always says human.
const botid = vi.hoisted(() => ({ isBot: false, pada: false }));
vi.mock("botid/server", () => ({
  checkBotId: async () => {
    if (botid.pada) throw new Error("BotID nedostupan");
    return { isBot: botid.isBot, isHuman: !botid.isBot };
  },
}));

beforeAll(async () => {
  pripremiOkruzenje();
  await ocisti();
}, 60_000);
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const pokusaji = async () => Number((await (await demoBaza()).query<{ n: string }>("select count(*) as n from public.pin_pokusaji")).rows[0].n);

it("refuses a bot before any PIN is checked or counted, and lets a human through", async () => {
  const ljudi = await osoblje();
  await postaviPin(ljudi.sefica.id, PIN_SEFICE);
  const prije = await pokusaji();

  botid.isBot = true;
  for (const odgovor of [
    await prijava(zahtjev("/api/prijava", { tijelo: { uloga: "sefica", pin: "9999" } })),
    await pin(zahtjev("/api/pin", { tijelo: { kod: "123456", noviPin: "4827" } })),
  ]) {
    expect(odgovor.status).toBe(403);
    expect(await odgovor.json()).toEqual({ greska: "Provjera uređaja nije uspjela. Osvježite stranicu i pokušajte ponovo." });
  }
  expect(await pokusaji()).toBe(prije);

  botid.isBot = false;
  expect((await prijava(zahtjev("/api/prijava", { tijelo: { uloga: "sefica", pin: PIN_SEFICE } }))).status).toBe(200);
});

it("refuses a bot with a waiter's session at both manager-PIN checks, and lets a plain order through", async () => {
  const ljudi = await osoblje();
  const p = await proizvodi();
  const kolacici = [ljudi.konobar.kolacic];
  const order = (posebanPin?: string) =>
    narudzba(
      zahtjev("/api/narudzbe", {
        tijelo: { requestId: randomUUID(), stoId: 3, stavke: [{ proizvodId: p["Espresso"], kolicina: 1 }], posebanPin },
        kolacici,
      }),
    );
  const prije = await pokusaji();

  botid.isBot = true;
  expect((await order("9999")).status).toBe(403);
  // An order without the manager's PIN checks no PIN, so BotID is not asked.
  expect((await order()).status).toBe(201);
  const racun = await racunStola(ljudi, 3);
  const odgovor = await popust(
    zahtjev(`/api/racuni/${racun.id}/popust`, { tijelo: { procenat: 10, razlog: "Stalni gost", pin: "9999" }, kolacici }),
    { params: Promise.resolve({ id: racun.id }) },
  );
  expect(odgovor.status).toBe(403);
  expect(await pokusaji()).toBe(prije);
  botid.isBot = false;
});

it("lets staff log in when BotID itself is down, still under the PIN lockouts", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  botid.pada = true;
  expect((await prijava(zahtjev("/api/prijava", { tijelo: { uloga: "sefica", pin: PIN_SEFICE } }))).status).toBe(200);
  expect((await prijava(zahtjev("/api/prijava", { tijelo: { uloga: "sefica", pin: "9999" } }))).status).toBe(401);
  botid.pada = false;
});
