"use client";

import { useState } from "react";
import { greskaIz } from "@/lib/api/greskaIz";
import { dugme, glavno } from "./stil";
import { NEMA_VEZE, PRIJAVA } from "./useMeni";

type Radnja = "premjesti" | "spoji" | "dodaj";
const naziv: Record<Radnja, string> = { premjesti: "Premjesti sto", spoji: "Spoji sa stolom", dodaj: "Dodaj sto" };


// slobodni: free table ids, zauzeti: ids of tables with an open bill that is not this one.
export default function StoloAkcije({
  stoId,
  slobodni,
  zauzeti,
  onGotovo,
}: {
  stoId: number;
  slobodni: number[];
  zauzeti: number[];
  onGotovo: (idiNa: number | null) => void;
}) {
  const [radnja, postaviRadnju] = useState<Radnja | null>(null);
  const [cilj, postaviCilj] = useState("");
  const [potvrda, postaviPotvrdu] = useState(false);
  const [greska, postaviGresku] = useState("");
  const [saljem, postaviSaljem] = useState(false);

  const izbor = radnja === "spoji" ? zauzeti : slobodni;

  function odaberi(r: Radnja | null) {
    postaviRadnju(r);
    postaviCilj("");
    postaviPotvrdu(false);
    postaviGresku("");
  }

  async function posalji(e: React.FormEvent) {
    e.preventDefault();
    if (saljem || !radnja) return;
    if (!cilj) return postaviGresku("Izaberite sto.");
    if (radnja === "spoji" && !potvrda) return postaviPotvrdu(true);
    postaviGresku("");
    postaviSaljem(true);
    try {
      const odgovor = await fetch("/api/stolovi/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ radnja, stoIz: stoId, stoU: Number(cilj) }),
      });
      if (odgovor.status === 401) return window.location.assign(PRIJAVA);
      if (!odgovor.ok) {
        postaviPotvrdu(false);
        return postaviGresku(await greskaIz(odgovor));
      }
      odaberi(null);
      onGotovo(radnja === "dodaj" ? null : Number(cilj));
    } catch {
      postaviGresku(NEMA_VEZE);
    } finally {
      postaviSaljem(false);
    }
  }

  return (
    <section aria-label="Radnje sa stolom" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(naziv) as Radnja[]).map((r) => (
          <button key={r} type="button" className={dugme} aria-pressed={radnja === r} onClick={() => odaberi(radnja === r ? null : r)}>
            {naziv[r]}
          </button>
        ))}
      </div>
      {radnja && (
        <form onSubmit={posalji} noValidate className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            {radnja === "premjesti" && "Premjesti na slobodan sto"}
            {radnja === "spoji" && "Spoji sa stolom (račun ovog stola prelazi na izabrani sto)"}
            {radnja === "dodaj" && "Dodaj slobodan sto ovom računu"}
            <select
              value={cilj}
              onChange={(e) => {
                postaviCilj(e.target.value);
                postaviPotvrdu(false);
              }}
              className="min-h-12 rounded-lg border-2 border-okvir bg-background px-3 text-lg"
            >
              <option value="">Izaberite sto</option>
              {izbor.map((id) => (
                <option key={id} value={id}>
                  Sto {id}
                </option>
              ))}
            </select>
          </label>
          {potvrda && (
            <p role="alert" className="font-bold">
              Spajanje se ne može poništiti. Spojiti sto {stoId} sa stolom {cilj}?
            </p>
          )}
          <button type="submit" className={glavno} aria-disabled={saljem}>
            {saljem ? "Šaljem…" : potvrda ? "Da, spoji" : naziv[radnja]}
          </button>
          <button type="button" className={dugme} onClick={() => odaberi(null)}>
            Odustani
          </button>
        </form>
      )}
      <p role="alert" className="font-bold text-error">
        {greska}
      </p>
    </section>
  );
}
