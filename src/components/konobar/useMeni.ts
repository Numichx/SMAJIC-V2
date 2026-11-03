"use client";

import { useEffect, useState } from "react";
import { greskaIz } from "@/lib/api/greskaIz";
import { procitajMeni, sacuvajMeni } from "@/lib/offline/queue";
import { CEKANJE_MS } from "@/lib/offline/sync";
import type { Meni } from "./tipovi";

export const NEMA_VEZE = "Nema veze sa serverom. Pokušajte ponovo.";
export const PRIJAVA = "/login?uloga=konobar";

export function useMeni() {
  const [meni, postaviMeni] = useState<Meni | null>(null);
  const [greska, postaviGresku] = useState("");
  const [izKopije, postaviIzKopije] = useState(false);

  useEffect(() => {
    async function izKesa(poruka: string) {
      const kopija = await procitajMeni().catch(() => null);
      if (!kopija) return postaviGresku(poruka);
      postaviMeni(kopija);
      postaviIzKopije(true);
    }
    fetch("/api/meni", { signal: AbortSignal.timeout(CEKANJE_MS) })
      .then(async (odgovor) => {
        if (odgovor.status === 401) return window.location.assign(PRIJAVA);
        if (!odgovor.ok) return izKesa(await greskaIz(odgovor));
        const novi: Meni = await odgovor.json();
        postaviMeni(novi);
        // Without IndexedDB the screen simply has no copy for next time.
        sacuvajMeni(novi).catch(() => {});
      })
      .catch(() => izKesa(NEMA_VEZE));
  }, []);

  return { meni, greska, izKopije };
}
