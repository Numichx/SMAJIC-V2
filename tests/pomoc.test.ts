import { describe, expect, it } from "vitest";
import { PRISTUP } from "@/lib/auth/session";
import { VODIC } from "@/lib/pomoc/vodic";

describe("vodič za osoblje", () => {
  it("ima odjeljak i 5 do 10 koraka za svaku ulogu koja može otvoriti pomoć", () => {
    expect(Object.keys(VODIC).sort()).toEqual([...PRISTUP.pomoc].sort());

    for (const uloga of PRISTUP.pomoc) {
      expect(VODIC[uloga].koraci.length).toBeGreaterThanOrEqual(5);
      expect(VODIC[uloga].koraci.length).toBeLessThanOrEqual(10);
    }
  });
});
