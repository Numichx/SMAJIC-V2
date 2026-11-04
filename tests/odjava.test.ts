import { describe, expect, it } from "vitest";
import { porukaUpozorenjaOdjave } from "@/lib/offline/odjava";

describe("upozorenje pri odjavi", () => {
  it("ne upozorava bez reda, a uz red prikazuje tačan broj neposlanih narudžbi", () => {
    expect(porukaUpozorenjaOdjave(0)).toBeNull();
    expect(porukaUpozorenjaOdjave(3)).toBe("Broj narudžbi koje još nisu poslane: 3.");
  });
});
