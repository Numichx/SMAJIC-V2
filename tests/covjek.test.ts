import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { POST as pin } from "@/app/api/pin/route";
import { POST as prijava } from "@/app/api/prijava/route";
import { demoBaza } from "@/lib/demo/store";
import { ocisti, osoblje, PIN_SEFICE, pripremiOkruzenje, postaviPin, zahtjev } from "./pomocnici";

// On Vercel, checkBotId answers isBot for a script that skipped the app's page. Locally it always says human.
const botid = vi.hoisted(() => ({ isBot: false }));
vi.mock("botid/server", () => ({ checkBotId: async () => ({ isBot: botid.isBot, isHuman: !botid.isBot }) }));

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
