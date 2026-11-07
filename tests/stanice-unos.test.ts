import { describe, expect, it } from "vitest";
import { brojIzUnosa, poredajStavke, sumnjivaTezina, zaPripremu, type Stavka } from "@/components/stanice/unos";

const s = (id: number, naziv: string, prilogUz: number | null = null, prilogUzNaziv: string | null = null): Stavka => ({
  id, naziv, jedinica: "porcija", kolicina: 1, napomena: null, prilogUz, prilogUzNaziv, trebaTezinu: false, stornoRazlog: null,
});

describe("unos stanice", () => {
  it("prihvata zarez i tačku, odbija ostalo", () => {
    expect(brojIzUnosa("0,62")).toBe(0.62);
    expect(brojIzUnosa(" 1.5 ")).toBe(1.5);
    for (const t of ["", "1e3", "0,6,2", "-1", "abc"]) expect(brojIzUnosa(t)).toBeNaN();
  });
  it("traži potvrdu kad je težina duplo veća ili manja od naručene", () => {
    expect(sumnjivaTezina(6.2, 0.62)).toBe(true);
    expect(sumnjivaTezina(0.3, 1)).toBe(true);
    expect(sumnjivaTezina(2, 1)).toBe(false);
    expect(sumnjivaTezina(0.5, 1)).toBe(false);
    expect(sumnjivaTezina(1.4, 1.5)).toBe(false);
  });
  it("prilog ide ispod jela, a prilog tuđeg jela stoji sam s nazivom jela", () => {
    const r = poredajStavke([s(1, "Pljeskavica"), s(2, "Pomfrit", 1, "Pljeskavica"), s(3, "Pomfrit", 9, "Ćevapi")]);
    expect(r.map((x) => [x.stavka.id, x.prilozi.map((p) => p.id), x.uz])).toEqual([
      [1, [2], null],
      [3, [], "Ćevapi"],
    ]);
  });

  it("zbraja samo otvorene, nestornirane stavke po nazivu i jedinici", () => {
    const st = (id: number, naziv: string, kolicina: number, jedinica = "porcija", stornoRazlog: string | null = null): Stavka => ({
      id, naziv, jedinica, kolicina, napomena: null, prilogUz: null, prilogUzNaziv: null, trebaTezinu: false, stornoRazlog,
    });
    expect(
      zaPripremu([
        { status: "Novo", stavke: [st(1, "Pljeskavica", 2), st(2, "Janjetina", 0.1, "kg")] },
        { status: "U pripremi", stavke: [st(3, "Pljeskavica", 1), st(4, "Janjetina", 0.2, "kg"), st(5, "Pljeskavica", 5, "porcija", "greška")] },
        { status: "Gotovo", stavke: [st(6, "Pljeskavica", 9)] },
      ]),
    ).toEqual([
      { naziv: "Pljeskavica", jedinica: "porcija", kolicina: 3 },
      { naziv: "Janjetina", jedinica: "kg", kolicina: 0.3 },
    ]);
  });
});
