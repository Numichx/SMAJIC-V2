"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dugme, polje } from "@/components/konobar/stil";
import { formatKM } from "@/lib/format";
import { novacIzUnosa } from "./brojevi";
import { idPokusaja, pozovi } from "./pozivi";

const PRIJAVA = "/login?uloga=pecenjara";
type Dug = { konobarId: string; ime: string; izdato: number; placeno: number; dug: number };
type Pregled = { dugovi: Dug[]; ukupno: number };

export default function DugPecenjare() {
  const [pregled, postaviPregled] = useState<Pregled | null>(null);
  const [iznosi, postaviIznose] = useState<Record<string, string>>({});
  const [greska, postaviGresku] = useState("");
  const [poruka, postaviPoruku] = useState("");
  const zauzeto = useRef(false);
  const pokusaj = useRef<{ kljuc: string; id: string } | null>(null);

  const ucitaj = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const r = await pozovi<Pregled>("/api/pecenjara/dug", PRIJAVA);
    if (r.ok) {
      postaviPregled(r.podaci);
      postaviGresku("");
    } else postaviGresku(r.greska);
  }, []);

  // Polling replaces the list only, so amounts typed into the rows stay.
  useEffect(() => {
    const prvo = setTimeout(ucitaj, 0);
    const sat = setInterval(ucitaj, 10_000);
    return () => {
      clearTimeout(prvo);
      clearInterval(sat);
    };
  }, [ucitaj]);

  async function uplati(e: React.FormEvent, d: Dug) {
    e.preventDefault();
    const iznos = novacIzUnosa(iznosi[d.konobarId] ?? "");
    if (Number.isNaN(iznos) || iznos <= 0) return postaviGresku("Unesite iznos uplate veći od nule, na primjer 20,50.");
    if (zauzeto.current) return;
    zauzeto.current = true;
    postaviGresku("");
    postaviPoruku("");
    try {
      const id = idPokusaja(pokusaj, JSON.stringify([d.konobarId, iznos]));
      const r = await pozovi<{ uplata: { preostaliDug: number } }>("/api/pecenjara/dug", PRIJAVA, "POST", { requestId: id, konobarId: d.konobarId, iznos });
      if (!r.ok) return postaviGresku(r.greska);
      pokusaj.current = null;
      postaviIznose({ ...iznosi, [d.konobarId]: "" });
      postaviPoruku(`Uplata od ${formatKM(iznos)} je evidentirana za ${d.ime}. Preostali dug: ${formatKM(r.podaci.uplata.preostaliDug)}.`);
      await ucitaj();
    } finally {
      zauzeto.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="font-semibold text-greska">
        {greska}
      </p>
      <p role="status">{poruka}</p>
      {!pregled && !greska && <p role="status">Učitavam…</p>}
      {pregled && (
        <>
          <p className="text-lg font-semibold">Ukupan dug konobara: {formatKM(pregled.ukupno)}</p>
          {pregled.dugovi.length === 0 && <p>Nijedan konobar nema narudžbi s cijenom pečenjare.</p>}
          <ul className="grid gap-3 lg:grid-cols-2">
            {pregled.dugovi.map((d) => (
              <li key={d.konobarId}>
                <form onSubmit={(e) => uplati(e, d)} aria-label={d.ime} className="flex flex-col gap-2 rounded-lg border-2 border-okvir bg-povrsina p-3">
                  <strong className="text-lg">{d.ime}</strong>
                  <p>
                    Izdato: {formatKM(d.izdato)}, plaćeno: {formatKM(d.placeno)}
                  </p>
                  <p className="font-semibold">Dug: {formatKM(d.dug)}</p>
                  <label className="flex flex-col gap-1">
                    Uplata (KM)
                    <input
                      inputMode="decimal"
                      value={iznosi[d.konobarId] ?? ""}
                      onChange={(e) => postaviIznose({ ...iznosi, [d.konobarId]: e.target.value })}
                      className={polje}
                    />
                  </label>
                  <button type="submit" className={dugme}>
                    Evidentiraj uplatu
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
