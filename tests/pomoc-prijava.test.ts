import { NextRequest } from "next/server";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/prijava/route";
import { zastita } from "@/lib/proxy";
import { ocisti, osoblje, PIN_SEFICE, pripremiOkruzenje, postaviPin, zahtjev } from "./pomocnici";

beforeAll(async () => {
  pripremiOkruzenje();
  await ocisti();
}, 60_000);
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// The help section is open to every role. As a login it matched a PIN against all of them, with no name.
it("does not log in through the help section, even with the manager's PIN", async () => {
  await postaviPin((await osoblje()).sefica.id, PIN_SEFICE);
  expect((await POST(zahtjev("/api/prijava", { tijelo: { uloga: "pomoc", pin: PIN_SEFICE } }))).status).toBe(400);
  expect((await GET(zahtjev("/api/prijava?uloga=pomoc"))).status).toBe(400);
  expect((await POST(zahtjev("/api/prijava", { tijelo: { uloga: "sefica", pin: PIN_SEFICE } }))).status).toBe(200);
});

it("sends a visitor of the help pages with no session to the role picker", () => {
  const odgovor = zastita(new NextRequest("http://localhost/pomoc"));
  expect(odgovor.headers.get("location")).toBe("http://localhost/");
});
