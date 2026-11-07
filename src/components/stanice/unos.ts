export type Stavka = {
  id: number;
  naziv: string;
  jedinica: string;
  kolicina: number;
  napomena: string | null;
  prilogUz: number | null;
  prilogUzNaziv: string | null;
  trebaTezinu: boolean;
  stornoRazlog: string | null;
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

// What is still to cook across open orders, summed per dish: in a rush the grill works from this line.
export function zaPripremu(narudzbe: { status: string; stavke: Stavka[] }[]) {
  const zbir = new Map<string, { naziv: string; jedinica: string; kolicina: number }>();
  for (const n of narudzbe) {
    if (n.status !== "Novo" && n.status !== "U pripremi") continue;
    for (const s of n.stavke) {
      if (s.stornoRazlog) continue;
      const kljuc = `${s.naziv}\u0000${s.jedinica}`;
      const z = zbir.get(kljuc) ?? { naziv: s.naziv, jedinica: s.jedinica, kolicina: 0 };
      // Kilograms add up in floats; three decimals is the scale's precision.
      z.kolicina = Math.round((z.kolicina + s.kolicina) * 1000) / 1000;
      zbir.set(kljuc, z);
    }
  }
  return [...zbir.values()];
}
