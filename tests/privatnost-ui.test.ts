import { describe, expect, it } from "vitest";
import { daniIzUnosa, tijeloAnonimizacije } from "@/components/sefica/privatnostPomocno";

describe("daniIzUnosa", () => {
  it("prihvata cijele rokove od 30 do 3650 dana", () => {
    expect(daniIzUnosa("30")).toBe(30);
    expect(daniIzUnosa(" 365 ")).toBe(365);
    expect(daniIzUnosa("3650")).toBe(3650);
  });

  it("odbija decimalne, tekstualne i vanjske vrijednosti", () => {
    for (const unos of ["", "29", "3651", "30.5", "-30", "1e2", "abc"]) {
      expect(daniIzUnosa(unos)).toBeNull();
    }
  });
});

describe("tijeloAnonimizacije", () => {
  it("šalje oba eksplicitna roka, uključujući zadane vrijednosti", () => {
    expect(tijeloAnonimizacije(365, 90)).toEqual({ daniDugovi: 365, daniRezervacije: 90 });
  });

  it("uvijek šalje oba izabrana roka", () => {
    expect(tijeloAnonimizacije(400, 90)).toEqual({ daniDugovi: 400, daniRezervacije: 90 });
    expect(tijeloAnonimizacije(365, 120)).toEqual({ daniDugovi: 365, daniRezervacije: 120 });
    expect(tijeloAnonimizacije(400, 120)).toEqual({ daniDugovi: 400, daniRezervacije: 120 });
  });
});
