import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KOLACIC_SESIJE, TRAJANJE_SESIJE_S } from "@/lib/auth/session";
import { potpisi } from "@/lib/auth/sessionToken";
import { politikaSadrzaja, zastita } from "@/lib/proxy";
import { config } from "@/proxy";
import nextConfig from "../next.config";

const TAJNA = "t".repeat(43);
const SUPABASE = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"];

describe("proxy", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", TAJNA);
    for (const ime of SUPABASE) vi.stubEnv(ime, "");
  });
  afterEach(() => vi.unstubAllEnvs());

  function zahtjev(putanja: string, uloga?: string, tajna = TAJNA) {
    const token = uloga && potpisi("sesija", { id: "a", ime: "T", uloga }, tajna, TRAJANJE_SESIJE_S);
    return new NextRequest(`http://localhost${putanja}`, {
      headers: token ? { cookie: `${KOLACIC_SESIJE}=${token}` } : {},
    });
  }

  it("sends a visitor with no session to the login for that section", () => {
    const odgovor = zastita(zahtjev("/konobar/stolovi/3"));
    expect(odgovor.status).toBe(307);
    expect(odgovor.headers.get("location")).toBe("http://localhost/login?uloga=konobar");
  });

  it("treats a forged session as no session", () => {
    const odgovor = zastita(zahtjev("/sefica", "sefica", "d".repeat(43)));
    expect(odgovor.headers.get("location")).toBe("http://localhost/login?uloga=sefica");
  });

  it("sends the wrong role back to its own section", () => {
    const odgovor = zastita(zahtjev("/sefica/administracija", "kuhinja"));
    expect(odgovor.status).toBe(307);
    expect(odgovor.headers.get("location")).toBe("http://localhost/kuhinja");
  });

  it.each([
    ["konobar", "/sank"],
    ["sefica", "/sank"],
    ["konobar", "/konobar/racuni"],
    ["mesnica", "/mesnica"],
  ])("lets %s open %s", (uloga, putanja) => {
    const odgovor = zastita(zahtjev(putanja, uloga));
    expect(odgovor.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["kuhinja", "pecenjara", "mesnica"])("keeps %s out of the bar", (uloga) => {
    expect(zastita(zahtjev("/sank", uloga)).status).toBe(307);
  });

  it("does not treat a section-like prefix as that section", () => {
    expect(zastita(zahtjev("/konobari")).headers.get("x-middleware-next")).toBe("1");
  });

  it("sets a fresh CSP nonce on each page and passes it to the renderer", () => {
    const prvi = zastita(zahtjev("/"));
    const drugi = zastita(zahtjev("/"));
    const csp = prvi.headers.get("Content-Security-Policy")!;

    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).not.toBe(drugi.headers.get("Content-Security-Policy"));
    expect(prvi.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
  });

  it("leaves API routes to check their own session", () => {
    const odgovor = zastita(zahtjev("/api/sesija"));
    expect(odgovor.headers.get("x-middleware-next")).toBe("1");
    expect(odgovor.headers.get("location")).toBeNull();
  });

  it("returns 503 everywhere except the health route when misconfigured", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "samo-jedan");
    expect(zastita(zahtjev("/")).status).toBe(503);
    expect(zastita(zahtjev("/api/prijava")).status).toBe(503);
    expect(zastita(zahtjev("/api/status")).headers.get("x-middleware-next")).toBe("1");
  });

  it("allows nothing unsafe in the production CSP", () => {
    const csp = politikaSadrzaja("abc", false);
    expect(csp).not.toContain("unsafe");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it.each(["/", "/login", "/konobar", "/sefica/administracija", "/api/status"])("runs on %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });

  it.each(["/meni/rostilj/pljeskavica.jpg", "/meni/rostilj/teleci-bubreg.webp", "/_next/static/x.js", "/favicon.ico"])(
    "skips %s",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
    },
  );
});

describe("security headers", () => {
  it("are set on every path", async () => {
    const [pravilo] = await nextConfig.headers!();
    expect(pravilo.source).toBe("/:path*");

    const imena = pravilo.headers.map((z) => z.key);
    expect(imena).toEqual(
      expect.arrayContaining([
        "Strict-Transport-Security",
        "X-Frame-Options",
        "X-Content-Type-Options",
        "Referrer-Policy",
        "Permissions-Policy",
      ]),
    );
    expect(pravilo.headers.find((z) => z.key === "X-Frame-Options")?.value).toBe("DENY");
  });

  it("do not advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe("source rules", () => {
  const izvor = path.resolve("src");
  const datoteke = (readdirSync(izvor, { recursive: true }) as string[])
    .filter((d) => /\.tsx?$/.test(d))
    .map((d) => ({ ime: d.replaceAll("\\", "/"), tekst: readFileSync(path.join(izvor, d), "utf8") }));

  it("finds the source files", () => {
    expect(datoteke.length).toBeGreaterThan(10);
  });

  it("keeps Supabase out of components and pages", () => {
    const ekrani = datoteke.filter(({ ime }) => ime.startsWith("components/") || (ime.startsWith("app/") && !ime.startsWith("app/api/")));
    expect(ekrani.length).toBeGreaterThan(0);
    expect(ekrani.filter(({ tekst }) => /lib\/supabase|@supabase\//.test(tekst)).map((d) => d.ime)).toEqual([]);
  });

  it("keeps the secret key inside the server client", () => {
    const koriste = datoteke.filter(({ tekst }) => tekst.includes("process.env.SUPABASE_SECRET_KEY")).map((d) => d.ime);
    expect(koriste).toEqual(["lib/supabase/admin.ts"]);
  });

  it("uses no NEXT_PUBLIC variables, which Next.js freezes at build time", () => {
    expect(datoteke.filter(({ tekst }) => tekst.includes("NEXT_PUBLIC_")).map((d) => d.ime)).toEqual([]);
  });

  it("never renders raw HTML", () => {
    expect(datoteke.filter(({ tekst }) => tekst.includes("dangerouslySetInnerHTML")).map((d) => d.ime)).toEqual([]);
  });

  it("uses no inline style attributes, which the production CSP blocks", () => {
    expect(datoteke.filter(({ tekst }) => /\sstyle=\{/.test(tekst)).map((d) => d.ime)).toEqual([]);
  });

  it("makes every API route validate through the session or a strict schema", () => {
    const rute = datoteke.filter(({ ime }) => ime.startsWith("app/api/") && ime !== "app/api/status/route.ts");
    expect(rute.length).toBeGreaterThan(0);
    for (const { ime, tekst } of rute) {
      expect(tekst.includes("zahtijevajSesiju") || tekst.includes("strictObject"), ime).toBe(true);
      expect(tekst, ime).not.toMatch(/\.from\(/);
    }
  });
});
