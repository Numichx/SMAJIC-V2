import { describe, expect, it } from "vitest";
import { danasUSarajevu } from "@/components/sefica/zIzvjestajPomocno";

describe("danasUSarajevu", () => {
  it("određuje kalendarski dan u Sarajevu zimi i ljeti", () => {
    expect(danasUSarajevu(new Date("2026-11-03T23:30:00Z"))).toBe("2026-11-04");
    expect(danasUSarajevu(new Date("2026-07-03T22:30:00Z"))).toBe("2026-07-04");
  });

  it("ne pomjera dan kada je UTC datum isti kao sarajevski datum", () => {
    expect(danasUSarajevu(new Date("2026-11-03T12:00:00Z"))).toBe("2026-11-03");
  });
});
