// A preview for the waiter's cart. The server's kreiraj_narudzbu computes the real amounts, and tests/procjena.test.ts catches drift.

export type Prilog = { id: string; cijena: number; poseban: boolean };

// Same as SQL round(kolicina * cijena, 2), in whole units so floats cannot shift a fening.
const iznos = (kolicina: number, cijena: number) => Math.round((Math.round(kolicina * 1000) * Math.round(cijena * 100)) / 1000) / 100;

// One free side per dish, and a special side is always charged.
export function cijenePriloga(prilozi: Prilog[], besplatni: string[]) {
  let slobodan = true;
  return prilozi.map((p) => {
    const besplatan = slobodan && !p.poseban && besplatni.includes(p.id);
    if (besplatan) slobodan = false;
    return besplatan ? 0 : p.cijena;
  });
}

export function procjenaStavke(cijena: number, kolicina: number, jedinica: string, prilozi: Prilog[], besplatni: string[]) {
  const porcija = jedinica === "kg" ? 1 : kolicina;
  return cijenePriloga(prilozi, besplatni).reduce((zbir, c) => zbir + iznos(porcija, c), iznos(kolicina, cijena));
}
