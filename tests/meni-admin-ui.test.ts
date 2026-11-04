import { describe, expect, it } from "vitest";
import { cijenaIzUnosa, potvrdaCijenePotrebna, redoslijedIzUnosa } from "@/components/sefica/meniAdminPomocno";

describe("cijenaIzUnosa", () => {
  it("prihvata zarez ili tačku i najviše dvije decimale", () => {
    expect(cijenaIzUnosa("12,5")).toBe(12.5);
    expect(cijenaIzUnosa("12.50")).toBe(12.5);
    expect(cijenaIzUnosa(" 0,01 ")).toBe(0.01);
    expect(cijenaIzUnosa("9999,99")).toBe(9999.99);
  });

  it("odbija neispravan unos i cijene izvan dozvoljenog raspona", () => {
    for (const unos of ["", "0", "10000", "0,001", "1e2", "-1", "12,"]) {
      expect(cijenaIzUnosa(unos)).toBeNull();
    }
  });
});

describe("redoslijedIzUnosa", () => {
  it("dopušta prazan redoslijed i vraća validan cijeli broj", () => {
    expect(redoslijedIzUnosa("")).toEqual({ ispravno: true });
    expect(redoslijedIzUnosa("  ")).toEqual({ ispravno: true });
    expect(redoslijedIzUnosa("1")).toEqual({ ispravno: true, vrijednost: 1 });
    expect(redoslijedIzUnosa("9999")).toEqual({ ispravno: true, vrijednost: 9999 });
  });

  it("odbija razlomke, tekst i brojeve izvan raspona", () => {
    for (const unos of ["0", "10000", "1,5", "1.5", "-1", "abc"]) {
      expect(redoslijedIzUnosa(unos)).toEqual({ ispravno: false });
    }
  });
});

describe("potvrdaCijenePotrebna", () => {
  it("traži drugi tap samo za novu ili promijenjenu cijenu", () => {
    expect(potvrdaCijenePotrebna(undefined, 12.5)).toBe(true);
    expect(potvrdaCijenePotrebna(12, 12.5)).toBe(true);
    expect(potvrdaCijenePotrebna(12.5, 12.5)).toBe(false);
  });
});
