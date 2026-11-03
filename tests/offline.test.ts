import { describe, expect, it } from "vitest";
import { tijeloZaRed, trebaVezu } from "@/lib/offline/queue";
import { MAX_STAROST_MS, noviRacun, odlukaZaOdgovor, prestaro } from "@/lib/offline/sync";

describe("the answer to a queued order decides what happens to it", () => {
  it.each([
    [201, "ukloni"],
    [200, "ukloni"],
    [400, "odbaci"],
    [422, "odbaci"],
    [401, "prijava"],
    [403, "zadrzi"],
    [404, "zadrzi"],
    [429, "zadrzi"],
    [500, "zadrzi"],
    [503, "zadrzi"],
  ])("%i: %s", (status, odluka) => {
    expect(odlukaZaOdgovor(status)).toBe(odluka);
  });
});

describe("what may enter the queue", () => {
  const stavka = { proizvodId: "p", kolicina: 1 };

  it("a special side needs a connection, an ordinary one does not", () => {
    expect(trebaVezu([stavka, { ...stavka, prilozi: [{ proizvodId: "x", poseban: true }] }])).toBe(true);
    expect(trebaVezu([stavka, { ...stavka, prilozi: [{ proizvodId: "x" }] }])).toBe(false);
    expect(trebaVezu([{ ...stavka, prilozi: [{ proizvodId: "x", poseban: false }] }])).toBe(false);
  });

  it("refuses a special side outright", () => {
    expect(() => tijeloZaRed({ requestId: "r", stoId: 1, stavke: [{ ...stavka, prilozi: [{ proizvodId: "x", poseban: true }] }] })).toThrow();
  });

  it("stores only the order's own fields, so a PIN cannot slip in", () => {
    const sPinom = { requestId: "r", stoId: 1, stavke: [stavka], posebanPin: "4827" };
    expect(JSON.stringify(tijeloZaRed(sPinom))).not.toContain("4827");
    expect(tijeloZaRed(sPinom)).toEqual({ requestId: "r", stoId: 1, stavke: [stavka] });
  });
});

describe("telling the waiter about a changed bill", () => {
  it("only when the bill the waiter saw is gone", () => {
    expect(noviRacun("a", "b")).toBe(true);
    expect(noviRacun("a", "a")).toBe(false);
    expect(noviRacun(undefined, "b")).toBe(false);
    expect(noviRacun("a", undefined)).toBe(false);
  });
});

describe("an order too old to send", () => {
  it("expires only past the limit", () => {
    expect(prestaro({ vrijeme: 0 }, MAX_STAROST_MS)).toBe(false);
    expect(prestaro({ vrijeme: 0 }, MAX_STAROST_MS + 1)).toBe(true);
  });
});
