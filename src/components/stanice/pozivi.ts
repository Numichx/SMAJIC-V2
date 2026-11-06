"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { NEMA_VEZE } from "@/components/konobar/useMeni";
import { greskaIz } from "@/lib/api/greskaIz";
import { CEKANJE_MS } from "@/lib/offline/sync";

export type Odgovor<T> = { ok: true; podaci: T } | { ok: false; greska: string };

// A 401 sends the user to login and returns an empty error, so the caller shows nothing.
export async function pozovi<T = unknown>(adresa: string, prijava: string, metoda = "GET", tijelo?: object): Promise<Odgovor<T>> {
  try {
    const odgovor = await fetch(adresa, {
      method: metoda,
      // A hung poll would keep the in-flight guard set and freeze the screen. Writes wait for their answer.
      ...(metoda === "GET" && { signal: AbortSignal.timeout(CEKANJE_MS) }),
      ...(tijelo && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(tijelo) }),
    });
    if (odgovor.status === 401) {
      window.location.assign(prijava);
      return { ok: false, greska: "" };
    }
    if (!odgovor.ok) return { ok: false, greska: await greskaIz(odgovor) };
    return { ok: true, podaci: (await odgovor.json()) as T };
  } catch {
    return { ok: false, greska: NEMA_VEZE };
  }
}

// The same attempt keeps its requestId, so a retry or a double tap cannot apply twice. Changed input, a new one.
export function idPokusaja(pokusaj: MutableRefObject<{ kljuc: string; id: string } | null>, kljuc: string) {
  if (pokusaj.current?.kljuc !== kljuc) pokusaj.current = { kljuc, id: crypto.randomUUID() };
  return pokusaj.current.id;
}

// A paged list. `prvi` is the whole first page, for routes that carry more than the list.
// Polling replaces only the first page, and only while no older page has been loaded.
export function useLista<T, P extends { imaJos: boolean }>(adresa: string, kljuc: keyof P, prijava: string, osvjeziMs = 0) {
  const [stavke, postaviStavke] = useState<T[] | null>(null);
  const [prvi, postaviPrvi] = useState<P | null>(null);
  const [imaJos, postaviJos] = useState(false);
  const [greska, postaviGresku] = useState("");
  const strana = useRef(1);
  const uToku = useRef(false);

  const ucitaj = useCallback(
    async (dalje = false) => {
      if (uToku.current || document.visibilityState !== "visible") return;
      if (!dalje && strana.current > 1 && osvjeziMs) return;
      uToku.current = true;
      const s = dalje ? strana.current + 1 : 1;
      const r = await pozovi<P>(`${adresa}${adresa.includes("?") ? "&" : "?"}strana=${s}`, prijava);
      uToku.current = false;
      if (!r.ok) return postaviGresku(r.greska);
      postaviGresku("");
      const nove = r.podaci[kljuc] as T[];
      strana.current = s;
      if (s === 1) postaviPrvi(r.podaci);
      postaviStavke((stare) => (dalje ? [...(stare ?? []), ...nove] : nove));
      postaviJos(r.podaci.imaJos);
    },
    [adresa, kljuc, prijava, osvjeziMs],
  );

  // A reload (new day, after a save) starts again at page 1.
  const iznova = useCallback(async () => {
    while (uToku.current) await new Promise((r) => setTimeout(r, 100));
    strana.current = 1;
    return ucitaj();
  }, [ucitaj]);

  useEffect(() => {
    strana.current = 1;
    const prvo = setTimeout(() => ucitaj(), 0);
    const sat = osvjeziMs ? setInterval(() => ucitaj(), osvjeziMs) : undefined;
    return () => {
      clearTimeout(prvo);
      clearInterval(sat);
    };
  }, [ucitaj, osvjeziMs]);

  return { stavke, prvi, imaJos, greska, iznova, jos: () => ucitaj(true) };
}
