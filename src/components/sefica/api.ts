"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { greskaIz } from "@/lib/api/greskaIz";
import { CEKANJE_MS } from "@/lib/offline/sync";

export const NEMA_VEZE = "Nema veze sa serverom. Pokušajte ponovo.";

export type Odgovor<T> = { ok: true; podaci: T } | { ok: false; greska: string };

// A 401 sends the person to the login of the section they are in; the caller then gets an empty error.
export async function zovi<T = unknown>(adresa: string, metoda?: "POST" | "PATCH", tijelo?: object): Promise<Odgovor<T>> {
  try {
    const odgovor = await fetch(
      adresa,
      // Reads time out so a hung poll cannot freeze the screen. Writes wait for their answer.
      metoda ? { method: metoda, headers: { "Content-Type": "application/json" }, body: JSON.stringify(tijelo) } : { signal: AbortSignal.timeout(CEKANJE_MS) },
    );
    if (odgovor.status === 401) {
      const prijava = location.pathname.startsWith("/mesnica") ? "/login?uloga=mesnica" : "/login?uloga=sefica";
      window.location.assign(prijava);
      return { ok: false, greska: "" };
    }
    if (!odgovor.ok) return { ok: false, greska: await greskaIz(odgovor) };
    return { ok: true, podaci: (await odgovor.json()) as T };
  } catch {
    return { ok: false, greska: NEMA_VEZE };
  }
}

// Loads on mount and when the address changes. With svakihMs it reloads while the tab is visible,
// and a failed reload keeps what is on screen.
export function useUcitaj<T>(adresa: string, svakihMs?: number) {
  const [podaci, postaviPodatke] = useState<T | null>(null);
  const [greska, postaviGresku] = useState("");
  const [n, postaviN] = useState(0);
  const osvjezi = useCallback(() => postaviN((x) => x + 1), []);

  useEffect(() => {
    let zivo = true;
    const ucitaj = () =>
      zovi<T>(adresa).then((r) => {
        if (!zivo) return;
        if (r.ok) {
          postaviPodatke(r.podaci);
          postaviGresku("");
        } else postaviGresku(r.greska);
      });
    ucitaj();
    const sat = svakihMs ? setInterval(() => document.visibilityState === "visible" && ucitaj(), svakihMs) : undefined;
    return () => {
      zivo = false;
      clearInterval(sat);
    };
  }, [adresa, n, svakihMs]);

  return { podaci, greska, osvjezi, ucitano: podaci !== null };
}

// One send at a time (a ref, so a second tap in the same tick is dropped). The requestId belongs to the
// attempt: it is kept for a retry of the same input and replaced once the send succeeded or the input changed.
export function useSlanje() {
  const zauzeto = useRef(false);
  const pokusaj = useRef<{ kljuc: string; id: string } | null>(null);
  const [saljem, postaviSaljem] = useState(false);
  const [greska, postaviGresku] = useState("");

  async function posalji<T>(kljuc: string, f: (requestId: string) => Promise<Odgovor<T>>): Promise<T | null> {
    if (zauzeto.current) return null;
    zauzeto.current = true;
    postaviSaljem(true);
    postaviGresku("");
    if (pokusaj.current?.kljuc !== kljuc) pokusaj.current = { kljuc, id: crypto.randomUUID() };
    try {
      const r = await f(pokusaj.current.id);
      if (r.ok) {
        pokusaj.current = null;
        return r.podaci;
      }
      postaviGresku(r.greska);
      return null;
    } finally {
      zauzeto.current = false;
      postaviSaljem(false);
    }
  }

  return { saljem, greska, postaviGresku, posalji };
}
