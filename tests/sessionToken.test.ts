import { describe, expect, it } from "vitest";
import { potpisi, provjeri } from "@/lib/auth/sessionToken";

const TAJNA = "t".repeat(43);
const SADA = 1_800_000_000_000;
const SAT = 3600;

describe("sessionToken", () => {
  const token = potpisi("sesija", { id: "a", uloga: "konobar" }, TAJNA, SAT, SADA);

  it("returns the data for a valid token", () => {
    expect(provjeri("sesija", token, TAJNA, SADA)).toMatchObject({ id: "a", uloga: "konobar" });
  });

  it("is valid until just before it expires", () => {
    expect(provjeri("sesija", token, TAJNA, SADA + (SAT - 1) * 1000)).not.toBeNull();
    expect(provjeri("sesija", token, TAJNA, SADA + SAT * 1000)).toBeNull();
  });

  it("rejects a changed payload", () => {
    const [sadrzaj, potpis] = token.split(".");
    const izmijenjeno = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(sadrzaj, "base64url").toString()), uloga: "sefica" }),
    ).toString("base64url");
    expect(provjeri("sesija", `${izmijenjeno}.${potpis}`, TAJNA, SADA)).toBeNull();
  });

  it("rejects a changed signature, including a shorter one", () => {
    const [sadrzaj, potpis] = token.split(".");
    expect(provjeri("sesija", `${sadrzaj}.${potpis.slice(0, -1)}A`, TAJNA, SADA)).toBeNull();
    expect(provjeri("sesija", `${sadrzaj}.A`, TAJNA, SADA)).toBeNull();
  });

  it("rejects another secret, so changing the secret logs everyone out", () => {
    expect(provjeri("sesija", token, "d".repeat(43), SADA)).toBeNull();
  });

  it("rejects a token signed for another purpose", () => {
    const uredjaj = potpisi("uredjaj", { u: "x" }, TAJNA, SAT, SADA);
    expect(provjeri("sesija", uredjaj, TAJNA, SADA)).toBeNull();
  });

  it.each([undefined, "", "abc", "a.b.c", ".", "a."])("rejects malformed token %s", (los) => {
    expect(provjeri("sesija", los, TAJNA, SADA)).toBeNull();
  });

  it("rejects everything when no secret is set", () => {
    expect(provjeri("sesija", token, undefined, SADA)).toBeNull();
  });
});
