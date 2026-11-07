import { describe, expect, it } from "vitest";
import { detaljiTekst, formatDatum, formatVrijeme, jednako, kolicinaIzUnosa, prethodniDan, razlikaTekst } from "@/components/sefica/pomocno";

describe("vrijeme", () => {
  it("prikazuje sarajevsko vrijeme, zimsko i ljetno", () => {
    expect(formatVrijeme("2026-11-03T13:05:00Z")).toBe("03.11.2026. 14:05");
    expect(formatVrijeme("2026-07-03T13:05:00Z")).toBe("03.07.2026. 15:05");
    expect(formatVrijeme("2026-11-03T23:30:00Z")).toBe("04.11.2026. 00:30");
  });
  it("preslaže datum i vraća prethodni dan preko granice mjeseca i godine", () => {
    expect(formatDatum("2026-11-03")).toBe("03.11.2026.");
    expect(prethodniDan("2026-11-01")).toBe("2026-10-31");
    expect(prethodniDan("2026-01-01")).toBe("2025-12-31");
    expect(prethodniDan("2024-03-01")).toBe("2024-02-29");
  });
});

describe("kolicinaIzUnosa", () => {
  it("prihvata zarez i tačku, odbija previše decimala i smeće", () => {
    expect(kolicinaIzUnosa("0,62", 3)).toBe(0.62);
    expect(kolicinaIzUnosa("2.5", 3)).toBe(2.5);
    expect(kolicinaIzUnosa("0", 0)).toBe(0);
    expect(kolicinaIzUnosa("1,5", 0)).toBeNaN();
    expect(kolicinaIzUnosa("1,2345", 3)).toBeNaN();
    expect(kolicinaIzUnosa("12,345", 2)).toBeNaN();
    expect(kolicinaIzUnosa("1e3", 3)).toBeNaN();
    expect(kolicinaIzUnosa("", 3)).toBeNaN();
    expect(kolicinaIzUnosa("-1", 3)).toBeNaN();
  });
});

describe("jednako", () => {
  it("poredi po vrijednosti, uključujući ugniježdene objekte i nizove", () => {
    const a = { racuni: 2, mesnica: { broj: 1, iznos: 5 }, x: [1, { y: 2 }] };
    expect(jednako(a, structuredClone(a))).toBe(true);
    expect(jednako(a, { ...a, racuni: 3 })).toBe(false);
    expect(jednako(a, { ...a, mesnica: { broj: 1, iznos: 6 } })).toBe(false);
    expect(jednako({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(jednako([], {})).toBe(false);
    expect(jednako(null, {})).toBe(false);
  });
});

describe("detaljiTekst", () => {
  it("ispisuje ključ: vrijednost, ugniježdeno i s decimalnim zarezom", () => {
    expect(detaljiTekst({ razlog: "=1+1", stavke: [{ vrijednost: 2.5 }], prazno: [], ne: null, da: true })).toEqual([
      "razlog: =1+1",
      "stavke[1].vrijednost: 2,5",
      "prazno: –",
      "ne: –",
      "da: da",
    ]);
    expect(detaljiTekst(null)).toEqual([]);
    expect(detaljiTekst("tekst")).toEqual(["tekst"]);
  });
});

describe("razlikaTekst", () => {
  it("piše razliku u jednom obliku", () => {
    expect(razlikaTekst(-5)).toBe("−5,00 KM (manjak)");
    expect(razlikaTekst(2.5)).toBe("2,50 KM (višak)");
    expect(razlikaTekst(0)).toBe("0,00 KM (tačno)");
  });
});
