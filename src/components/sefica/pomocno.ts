import { brojIzUnosa } from "@/components/stanice/unos";
import { formatBroj, formatKM } from "@/lib/format";

// A typed amount with at most `decimale` decimals, or NaN. The server refuses more, but saying so on the spot is kinder.
export function kolicinaIzUnosa(tekst: string, decimale: number) {
  const n = brojIzUnosa(tekst);
  const f = 10 ** decimale;
  return Number.isNaN(n) || Math.abs(n * f - Math.round(n * f)) > 1e-6 ? NaN : n;
}

const dio = (d: Intl.DateTimeFormatPart[], t: string) => d.find((x) => x.type === t)?.value ?? "";

// "03.11.2026. 14:05" in Sarajevo time, whatever the device's own zone is.
export function formatVrijeme(iso: string) {
  const d = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sarajevo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  return `${dio(d, "day")}.${dio(d, "month")}.${dio(d, "year")}. ${dio(d, "hour")}:${dio(d, "minute")}`;
}

// A date column such as "2026-11-03" has no time, so it is only reordered.
export function formatDatum(datum: string) {
  const [g, m, d] = datum.split("-");
  return `${d}.${m}.${g}.`;
}

export function prethodniDan(datum: string) {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Both sides come from the same SQL, so key order matches; this compares by value anyway.
export function jednako(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => jednako((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

// The log's details are free-form JSON. Shown as "key: value" lines, always as text.
export function detaljiTekst(detalji: unknown, prefiks = ""): string[] {
  const prazno = prefiks ? [`${prefiks}: –`] : [];
  if (detalji === null || detalji === undefined) return prazno;
  if (Array.isArray(detalji)) {
    if (detalji.length === 0) return prazno;
    return detalji.flatMap((v, i) => detaljiTekst(v, `${prefiks}[${i + 1}]`));
  }
  if (typeof detalji === "object") {
    const unosi = Object.entries(detalji);
    if (unosi.length === 0) return prazno;
    return unosi.flatMap(([k, v]) => detaljiTekst(v, prefiks ? `${prefiks}.${k}` : k));
  }
  const v = typeof detalji === "number" ? formatBroj(detalji) : typeof detalji === "boolean" ? (detalji ? "da" : "ne") : String(detalji);
  return [prefiks ? `${prefiks}: ${v}` : v];
}

export const nazivRadnje = (radnja: string) => radnja.replaceAll("_", " ");

// One form everywhere: "−5,00 KM (manjak)", "5,00 KM (višak)", "0,00 KM (tačno)".
export const razlikaTekst = (iznos: number) => `${formatKM(iznos).replace("-", "−")} (${iznos < 0 ? "manjak" : iznos > 0 ? "višak" : "tačno"})`;
