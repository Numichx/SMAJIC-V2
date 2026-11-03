// Preview for the grill's closing screen, because a closed count cannot be changed.
// zatvori_popis_pecenjare stores the real figures, and tests/smjene.test.ts catches drift.

type Popis = {
  pocetneKokePecene: number;
  pocetneKokeSirove: number;
  pocetnaJanjetinaKg: number;
  dodatneKoke: number;
  dodatnaJanjetinaKg: number;
  preostaleKoke: number;
  preostalaJanjetinaKg: number;
  predaniPazar: number;
  cijenaKoke: number;
  cijenaJanjetine: number;
};

// Whole grams and fenings, because 0.1 + 0.2 is not 0.3 in floats.
const gram = (kg: number) => Math.round(kg * 1000);
const fen = (km: number) => Math.round(km * 100);

export function pregledPopisa(p: Popis) {
  const prodaneKoke = p.pocetneKokePecene + p.pocetneKokeSirove + p.dodatneKoke - p.preostaleKoke;
  const grami = gram(p.pocetnaJanjetinaKg) + gram(p.dodatnaJanjetinaKg) - gram(p.preostalaJanjetinaKg);
  const pazar = prodaneKoke * fen(p.cijenaKoke) + Math.round((grami * fen(p.cijenaJanjetine)) / 1000);
  return {
    moguce: prodaneKoke >= 0 && grami >= 0,
    prodaneKoke,
    prodanaJanjetinaKg: grami / 1000,
    pazarPoPopisu: pazar / 100,
    razlika: (fen(p.predaniPazar) - pazar) / 100,
  };
}
