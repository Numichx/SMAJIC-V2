import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SLIKE } from "@/lib/data/slike";

const entries = Object.entries(SLIKE);
const fotografije = entries.filter(([, s]) => s.vrsta === "fotografija");
const crtezi = entries.filter(([, s]) => s.vrsta === "crtez");

describe("SLIKE", () => {
  it("has 161 entries", () => {
    expect(entries).toHaveLength(161);
  });

  it("every putanja starts with /meni/ and exists under public/", () => {
    const javni = path.resolve("public");
    for (const [, s] of entries) {
      expect(s.putanja.startsWith("/meni/")).toBe(true);
      expect(existsSync(path.join(javni, s.putanja))).toBe(true);
    }
  });

  it("every photo has credits and an Unsplash link", () => {
    expect(fotografije).toHaveLength(155);
    for (const [, s] of fotografije) {
      expect(s.zasluge?.length ?? 0).toBeGreaterThan(0);
      expect(s.link?.startsWith("https://unsplash.com/photos/")).toBe(true);
    }
  });

  it("has exactly six drawings with null credits and links", () => {
    expect(crtezi.map(([k]) => k).sort()).toEqual(
      [
        "jela-po-narudzbi/Restovani mozak",
        "rostilj/Teleći bubreg",
        "rostilj/Teleća jetra sa žara",
        "pecenja/Pečena janjeća glava",
        "deserti/Hurmašica",
        "bezalkoholna-pica/Fast energetsko piće 0,25 l",
      ].sort(),
    );
    for (const [, s] of crtezi) {
      expect(s.zasluge).toBeNull();
      expect(s.link).toBeNull();
    }
  });

  it("photos end in .jpg and drawings end in .webp", () => {
    for (const [, s] of fotografije) expect(s.putanja.endsWith(".jpg")).toBe(true);
    for (const [, s] of crtezi) expect(s.putanja.endsWith(".webp")).toBe(true);
  });
});
