import { greskaIz } from "@/lib/api/greskaIz";
import { postaviKonobara, redPoRedu, ukloniIzReda, type Zapis } from "./queue";

// A request that hangs on bad wifi must end, so it counts as a lost connection. A retry is safe by requestId.
export const CEKANJE_MS = 15_000;
const INTERVAL_MS = 15_000;
const PRIJAVA = "/login?uloga=konobar";

// shortcut: 4 hours is a guess at when an unsent order is no longer wanted, so a device offline overnight does not cook yesterday's order; ask the owner after the trial week.
export const MAX_STAROST_MS = 4 * 60 * 60 * 1000;

export function odlukaZaOdgovor(status: number): "ukloni" | "odbaci" | "prijava" | "zadrzi" {
  if (status >= 200 && status < 300) return "ukloni";
  if (status === 400 || status === 422) return "odbaci";
  if (status === 401) return "prijava";
  return "zadrzi";
}

export const prestaro = (z: Pick<Zapis, "vrijeme">, sada: number) => sada - z.vrijeme > MAX_STAROST_MS;

// Only when the waiter saw a bill. A free table getting its first bill is what the waiter expected.
export const noviRacun = (vidjeni: string | undefined, poslije: string | undefined) => !!vidjeni && !!poslije && vidjeni !== poslije;

let javi: (veza: boolean) => void = () => {};
let uToku = false;

const uPrijavu = () => window.location.assign(PRIJAVA);

// Returns the name on the session cookie, the real sender of the next request: another tab may have changed it since this page loaded.
async function imeSesije() {
  try {
    const odgovor = await fetch("/api/sesija", { cache: "no-store", signal: AbortSignal.timeout(CEKANJE_MS) });
    if (odgovor.status === 401) {
      uPrijavu();
      return null;
    }
    javi(odgovor.status < 500);
    if (!odgovor.ok) return null;
    return ((await odgovor.json()) as { ime: string }).ime;
  } catch {
    javi(false);
    return null;
  }
}

// Returns whether the next entry may go.
async function posalji(z: Zapis) {
  let odgovor: Response;
  try {
    odgovor = await fetch("/api/narudzbe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(z.tijelo),
      signal: AbortSignal.timeout(CEKANJE_MS),
    });
  } catch {
    javi(false);
    return false;
  }
  javi(odgovor.status < 500);
  const odluka = odlukaZaOdgovor(odgovor.status);
  if (odluka === "ukloni") {
    const tijelo = (await odgovor.json().catch(() => ({}))) as { racunId?: string };
    await ukloniIzReda(
      z.id,
      noviRacun(z.racunId, tijelo.racunId)
        ? `Sto ${z.tijelo.stoId}: raniji račun je zatvoren ili premješten dok je narudžba čekala, pa je narudžba otišla na novi račun (${z.opis}). Provjerite sa gostima.`
        : undefined,
    );
    return true;
  }
  if (odluka === "odbaci") {
    await ukloniIzReda(z.id, `Sto ${z.tijelo.stoId}: narudžba NIJE poslana (${z.opis}). Razlog: ${await greskaIz(odgovor)}`);
    return true;
  }
  if (odluka === "prijava") uPrijavu();
  return false;
}

async function posaljiSve(sesija: string) {
  for (const z of await redPoRedu()) {
    // Someone else's order must not go under this session's name. It stays listed, and ages out like any other.
    if (z.konobar === sesija) {
      if (!(await posalji(z))) return;
    }
  }
}

// One sender across tabs. Without Web Locks (no HTTPS) two tabs may both send, which requestId makes harmless.
const jedanPosiljalac = (fn: () => Promise<void>) =>
  navigator.locks ? navigator.locks.request("smajic-red", { ifAvailable: true }, (brava) => (brava ? fn() : undefined)) : fn();

export async function isprazni() {
  if (uToku) return;
  uToku = true;
  try {
    const sada = Date.now();
    for (const z of await redPoRedu()) {
      if (prestaro(z, sada)) {
        await ukloniIzReda(z.id, `Sto ${z.tijelo.stoId}: narudžba je predugo čekala vezu i NIJE poslana (${z.opis}). Ako je još potrebna, unesite je ponovo.`);
      }
    }
  } catch {
    // IndexedDB unavailable: nothing can be waiting, and the connection state below still matters.
  }
  try {
    const sesija = await imeSesije();
    if (sesija) await jedanPosiljalac(() => posaljiSve(sesija));
  } catch {
    // The entry stays and the next round tries again.
  } finally {
    uToku = false;
  }
}

export function pokreniSync(konobar: string, naVezu: (veza: boolean) => void) {
  postaviKonobara(konobar);
  javi = naVezu;
  const naOffline = () => naVezu(false);
  isprazni();
  const sat = setInterval(isprazni, INTERVAL_MS);
  window.addEventListener("online", isprazni);
  window.addEventListener("offline", naOffline);
  return () => {
    clearInterval(sat);
    window.removeEventListener("online", isprazni);
    window.removeEventListener("offline", naOffline);
    javi = () => {};
    postaviKonobara(null);
  };
}
