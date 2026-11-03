import { describe, expect, it } from "vitest";
import { cijeliIzUnosa, kolicinaIzUnosa, novacIzUnosa } from "@/components/stanice/brojevi";
import { danasSarajevo, dodajDan, sarajevoUIso } from "@/components/stanice/vrijeme";

describe("brojevi iz unosa", () => {
  it("accepts a comma and refuses extra decimals, negatives and text", () => {
    expect(novacIzUnosa("245,50")).toBe(245.5);
    expect(novacIzUnosa("1,005")).toBeNaN();
    expect(kolicinaIzUnosa("0,125")).toBe(0.125);
    expect(kolicinaIzUnosa("0,1255")).toBeNaN();
    expect(kolicinaIzUnosa("-1")).toBeNaN();
    expect(kolicinaIzUnosa("")).toBeNaN();
    expect(cijeliIzUnosa("12")).toBe(12);
    expect(cijeliIzUnosa("1,5")).toBeNaN();
  });
});

describe("Sarajevo wall time", () => {
  it("converts winter and summer time, whatever the tablet zone", () => {
    expect(sarajevoUIso("2026-11-03", "19:30")).toBe("2026-11-03T18:30:00.000Z");
    expect(sarajevoUIso("2026-07-03", "19:30")).toBe("2026-07-03T17:30:00.000Z");
  });
  it("gives the Sarajevo date after local midnight and steps days", () => {
    expect(danasSarajevo(Date.parse("2026-11-03T23:30:00Z"))).toBe("2026-11-04");
    expect(dodajDan("2026-12-31", 1)).toBe("2027-01-01");
    expect(dodajDan("2026-03-01", -1)).toBe("2026-02-28");
  });
});
