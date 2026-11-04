export function cijenaIzUnosa(unos: string): number | null {
  const tekst = unos.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(tekst)) return null;

  const cijena = Number(tekst.replace(",", "."));
  return Number.isFinite(cijena) && cijena >= 0.01 && cijena <= 9999.99 ? cijena : null;
}

export function redoslijedIzUnosa(unos: string): { ispravno: true; vrijednost?: number } | { ispravno: false } {
  const tekst = unos.trim();
  if (!tekst) return { ispravno: true };
  if (!/^\d+$/.test(tekst)) return { ispravno: false };

  const vrijednost = Number(tekst);
  if (!Number.isInteger(vrijednost) || vrijednost < 1 || vrijednost > 9999) return { ispravno: false };
  return { ispravno: true, vrijednost };
}
