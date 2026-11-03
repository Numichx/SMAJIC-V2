export const NAZIV_STANICE: Record<string, string> = { kuhinja: "Kuhinja", pecenjara: "Pečenjara", sank: "Šank" };

// Not Intl: a browser without bs-BA data would print a dot.
export function formatKM(iznos: number) {
  return `${iznos.toFixed(2).replace(".", ",")} KM`;
}

// A plain number with a decimal comma, for quantities and percentages.
export function formatBroj(n: number) {
  return String(n).replace(".", ",");
}
