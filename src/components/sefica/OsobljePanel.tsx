"use client";

import { useEffect, useState } from "react";
import { greskaIz } from "@/lib/api/greskaIz";
import type { Uloga } from "@/lib/auth/session";

type Zaposlenik = { id: string; ime: string; uloga: Uloga; aktivan: boolean; ima_pin: boolean; ceka_aktivaciju: boolean };

const nazivi: Record<Uloga, string> = {
  konobar: "Konobar",
  kuhinja: "Kuhinja",
  pecenjara: "Pečenjara",
  mesnica: "Mesnica",
  sefica: "Šefica",
};

const NEMA_VEZE = "Nema veze sa serverom. Pokušajte ponovo.";
const PRIJAVA = "/login?uloga=sefica";

export default function OsobljePanel() {
  const [zaposlenici, postaviZaposlenike] = useState<Zaposlenik[]>([]);
  const [greska, postaviGresku] = useState("");
  const [kod, postaviKod] = useState<{ ime: string; kod: string } | null>(null);
  const [osvjezenje, osvjezi] = useState(0);

  useEffect(() => {
    fetch("/api/administracija/zaposlenici")
      .then(async (odgovor) => {
        if (odgovor.status === 401) return window.location.assign(PRIJAVA);
        if (!odgovor.ok) return postaviGresku(await greskaIz(odgovor));
        postaviZaposlenike((await odgovor.json()).zaposlenici);
      })
      .catch(() => postaviGresku(NEMA_VEZE));
  }, [osvjezenje]);

  async function noviPin(z: Zaposlenik) {
    postaviGresku("");
    try {
      const odgovor = await fetch("/api/administracija/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zaposlenikId: z.id }),
      });
      if (odgovor.status === 401) return window.location.assign(PRIJAVA);
      if (!odgovor.ok) return postaviGresku(await greskaIz(odgovor));
      postaviKod({ ime: z.ime, kod: (await odgovor.json()).kod });
      osvjezi((n) => n + 1);
    } catch {
      postaviGresku(NEMA_VEZE);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {greska && (
        <p role="alert" className="font-semibold text-greska">
          {greska}
        </p>
      )}
      {kod && (
        <section aria-label="Aktivacijski kod" className="rounded-lg border-2 border-akcent bg-povrsina p-4">
          <p className="font-semibold">{kod.ime}</p>
          <p className="my-2 text-4xl font-bold tracking-widest">{kod.kod}</p>
          <p>Kod vrijedi 15 minuta. Dajte ga zaposleniku da izabere svoj PIN.</p>
        </section>
      )}
      <ul className="flex flex-col gap-2">
        {zaposlenici.map((z) => (
          <li key={z.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border-2 border-okvir p-3">
            <div className="flex-1">
              <p className="text-lg font-semibold">{z.ime}</p>
              <p>
                {nazivi[z.uloga]} · {!z.aktivan ? "Neaktivan" : z.ceka_aktivaciju ? "Čeka aktivaciju" : z.ima_pin ? "Ima PIN" : "Nema PIN"}
              </p>
            </div>
            {z.aktivan && (
              <button
                type="button"
                onClick={() => noviPin(z)}
                aria-label={`Novi PIN za ${z.ime}`}
                className="min-h-12 rounded-lg bg-akcent px-4 font-semibold text-akcent-tekst"
              >
                Novi PIN
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
