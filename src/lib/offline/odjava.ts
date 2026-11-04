export function porukaUpozorenjaOdjave(brojNarudzbi: number): string | null {
  if (brojNarudzbi < 1) return null;
  return `Broj narudžbi koje još nisu poslane: ${brojNarudzbi}.`;
}
