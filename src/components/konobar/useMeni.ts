"use client";

import { useEffect, useState } from "react";
import { greskaIz } from "@/lib/api/greskaIz";
import type { Meni } from "./tipovi";

export const NEMA_VEZE = "Nema veze sa serverom. Pokušajte ponovo.";
export const PRIJAVA = "/login?uloga=konobar";

export function useMeni() {
  const [meni, postaviMeni] = useState<Meni | null>(null);
  const [greska, postaviGresku] = useState("");

  useEffect(() => {
    fetch("/api/meni")
      .then(async (odgovor) => {
        if (odgovor.status === 401) return window.location.assign(PRIJAVA);
        if (!odgovor.ok) return postaviGresku(await greskaIz(odgovor));
        postaviMeni(await odgovor.json());
      })
      .catch(() => postaviGresku(NEMA_VEZE));
  }, []);

  return { meni, greska };
}
