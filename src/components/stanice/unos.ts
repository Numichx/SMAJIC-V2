export type Stavka = {
  id: number;
  naziv: string;
  jedinica: string;
  kolicina: number;
  napomena: string | null;
  prilogUz: number | null;
  prilogUzNaziv: string | null;
  trebaTezinu: boolean;
};

// "0,62" and "0.62" are both fine; anything else is NaN, so "1e3" or "0,6,2" never reaches the server.
export function brojIzUnosa(tekst: string) {
  const t = tekst.trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

// A weight is entered once and cannot be corrected, so 6,2 for 0,62 must be confirmed.
export function sumnjivaTezina(kg: number, naruceno: number) {
  return kg > naruceno * 2 || kg < naruceno / 2;
}

export type Red = { stavka: Stavka; prilozi: Stavka[]; uz: string | null };

// A side nests under its dish when the dish is on this order; otherwise it stands alone as "X uz Y".
export function poredajStavke(stavke: Stavka[]): Red[] {
  const ids = new Set(stavke.map((s) => s.id));
  const nosioci = stavke.filter((s) => s.prilogUz === null || !ids.has(s.prilogUz));
  return nosioci.map((s) => ({
    stavka: s,
    uz: s.prilogUz !== null ? s.prilogUzNaziv : null,
    prilozi: stavke.filter((p) => p.prilogUz === s.id),
  }));
}
