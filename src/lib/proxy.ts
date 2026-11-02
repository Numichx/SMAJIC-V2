import { NextResponse, type NextRequest } from "next/server";
import { jeOdjeljak, KOLACIC_SESIJE, PRISTUP, type Sesija } from "@/lib/auth/session";
import { provjeri } from "@/lib/auth/sessionToken";
import { modAplikacije } from "@/lib/supabase/config";

export function politikaSadrzaja(nonce: string, razvoj: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${razvoj ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${razvoj ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(razvoj ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function zastita(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (modAplikacije() === "misconfigured" && pathname !== "/api/status") {
    return Response.json({ greska: "Aplikacija nije postavljena. Javite se šefici." }, { status: 503 });
  }
  // API routes check the session themselves and return JSON, not redirects.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const odjeljak = pathname.split("/")[1];
  if (jeOdjeljak(odjeljak)) {
    // Signature and role only. Layouts and API routes also check the employee is still active.
    const sesija = provjeri<Sesija>(
      "sesija",
      request.cookies.get(KOLACIC_SESIJE)?.value,
      process.env.SESSION_SECRET,
    );
    if (!sesija) {
      return NextResponse.redirect(new URL(`/login?uloga=${odjeljak}`, request.url));
    }
    if (!PRISTUP[odjeljak].includes(sesija.uloga)) {
      return NextResponse.redirect(new URL(`/${sesija.uloga}`, request.url));
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const politika = politikaSadrzaja(nonce, process.env.NODE_ENV === "development");

  const zaglavlja = new Headers(request.headers);
  zaglavlja.set("Content-Security-Policy", politika);

  const odgovor = NextResponse.next({ request: { headers: zaglavlja } });
  odgovor.headers.set("Content-Security-Policy", politika);
  return odgovor;
}
