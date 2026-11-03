const SARAJEVO = "Europe/Sarajevo";

const dijelovi = (ms: number) => {
  const d = new Intl.DateTimeFormat("en-US", {
    timeZone: SARAJEVO,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const g = (t: string) => Number(d.find((p) => p.type === t)?.value);
  return { g, kao_utc: Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) };
};

// "2026-11-03" and "19:30" are Sarajevo wall time, whatever zone the tablet is set to.
export function sarajevoUIso(datum: string, vrijeme: string) {
  const [y, m, d] = datum.split("-").map(Number);
  const [h, min] = vrijeme.split(":").map(Number);
  const zid = Date.UTC(y, m - 1, d, h, min);
  // Twice, because the offset is read at the guessed instant, which can sit on the other side of a clock change.
  let t = zid - (dijelovi(zid).kao_utc - zid);
  t = zid - (dijelovi(t).kao_utc - t);
  return new Date(t).toISOString();
}

const dva = (n: number) => String(n).padStart(2, "0");

export function danasSarajevo(ms = Date.now()) {
  const { g } = dijelovi(ms);
  return `${g("year")}-${dva(g("month"))}-${dva(g("day"))}`;
}

export function dodajDan(datum: string, n: number) {
  const [y, m, d] = datum.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const satSarajevo = (iso: string) => new Date(iso).toLocaleTimeString("bs-BA", { timeZone: SARAJEVO, hour: "2-digit", minute: "2-digit" });

export const vrijemeSarajevo = (iso: string) =>
  new Date(iso).toLocaleString("bs-BA", { timeZone: SARAJEVO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
