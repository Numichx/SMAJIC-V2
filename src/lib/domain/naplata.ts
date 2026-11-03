// Previews for the bill screen. naplati_racun computes the real amounts, and tests/naplata.test.ts catches drift.

export const RAZLOZI_STORNA = ["Pogrešan unos", "Gost odustao", "Greška kuhinje", "Drugo"] as const;
export const RAZLOZI_POPUSTA = ["Obrok osoblja", "Častimo", "Stalni gost", "Reklamacija", "Drugo"] as const;

// Whole fenings, because 20 - 17.3 is 2.6999999999999993 in floats.
const fen = (km: number) => Math.round(km * 100);

export function pregledNaplate(ukupno: number, gotovina: number, kartica: number, kusur: number) {
  const dao = fen(gotovina) + fen(kartica);
  return {
    najveciKusur: Math.max(0, Math.min(fen(gotovina), dao - fen(ukupno))) / 100,
    baksis: Math.max(0, dao - fen(kusur) - fen(ukupno)) / 100,
  };
}

// Same as podjela_racuna: the leftover fenings go on the first shares.
export function podjelaPoOsobi(ukupno: number, osoba: number) {
  const f = fen(ukupno);
  return Array.from({ length: osoba }, (_, i) => (Math.floor(f / osoba) + (i < f % osoba ? 1 : 0)) / 100);
}
