import { describe, expect, it } from "vitest";
import { formatKM } from "@/lib/format";

describe("formatKM", () => {
  it("koristi zarez i dvije decimale", () => {
    expect(formatKM(12.5)).toBe("12,50 KM");
    expect(formatKM(0)).toBe("0,00 KM");
    expect(formatKM(7)).toBe("7,00 KM");
  });
});
