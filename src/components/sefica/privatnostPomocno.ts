export function daniIzUnosa(unos: string): number | null {
  const tekst = unos.trim();
  if (!/^\d+$/.test(tekst)) return null;

  const dani = Number(tekst);
  return Number.isInteger(dani) && dani >= 30 && dani <= 3650 ? dani : null;
}

export function tijeloAnonimizacije(daniDugovi: number, daniRezervacije: number): {
  daniDugovi: number;
  daniRezervacije: number;
} {
  return { daniDugovi, daniRezervacije };
}
