"use client";

import { useRef, useState } from "react";
import { dugme, glavno, polje } from "@/components/konobar/stil";
import { pregledPopisa } from "@/lib/domain/pecenjara";
import { formatBroj, formatKM } from "@/lib/format";
import { cijeliIzUnosa, kolicinaIzUnosa, novacIzUnosa } from "./brojevi";
import { idPokusaja, pozovi, useLista } from "./pozivi";
import { vrijemeSarajevo } from "./vrijeme";

const PRIJAVA = "/login?uloga=pecenjara";
type Popis = {
  smjenaId: string;
  otvoreno: string;
  pocetneKokePecene: number;
  pocetneKokeSirove: number;
  pocetnaJanjetinaKg: number;
  zatvoreno: string | null;
  dodatneKoke: number | null;
  dodatnaJanjetinaKg: number | null;
  preostaleKoke: number | null;
  preostalaJanjetinaKg: number | null;
  prodaneKoke: number | null;
  prodanaJanjetinaKg: number | null;
  cijenaKoke: number | null;
  cijenaJanjetine: number | null;
  pazarPoPopisu: number | null;
  predaniPazar: number | null;
  razlika: number | null;
};
type Pregled = {
  smjena: { id: string; oznaka: string } | null;
  popis: Popis | null;
  cijene: { koka: number | null; janjetina: number | null };
  historija: Popis[];
  imaJos: boolean;
};

function Polje({ oznaka, vrijednost, postavi }: { oznaka: string; vrijednost: string; postavi: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      {oznaka}
      <input inputMode="decimal" value={vrijednost} onChange={(e) => postavi(e.target.value)} className={polje} />
    </label>
  );
}

function Sazetak({ p }: { p: Popis }) {
  return (
    <div className="flex flex-col gap-1">
      <p>
        Početno: pečenih pilića {p.pocetneKokePecene}, sirovih {p.pocetneKokeSirove}, jagnjetina {formatBroj(p.pocetnaJanjetinaKg)} kg
      </p>
      {p.zatvoreno && (
        <>
          <p>
            Dodatno: pilića {p.dodatneKoke}, jagnjetina {formatBroj(p.dodatnaJanjetinaKg ?? 0)} kg. Preostalo: pilića {p.preostaleKoke}, jagnjetina {formatBroj(p.preostalaJanjetinaKg ?? 0)} kg
          </p>
          <p>
            Prodano: pilića {p.prodaneKoke}, jagnjetina {formatBroj(p.prodanaJanjetinaKg ?? 0)} kg
          </p>
          <p>
            Pazar po popisu: {formatKM(p.pazarPoPopisu ?? 0)}. Predano: {formatKM(p.predaniPazar ?? 0)}. Razlika: {formatKM(p.razlika ?? 0)}
          </p>
        </>
      )}
    </div>
  );
}

export default function PopisPecenjare() {
  const lista = useLista<Popis, Pregled>("/api/pecenjara/smjena", "historija", PRIJAVA);
  const pregled = lista.prvi;
  const [koke1, postaviKoke1] = useState("");
  const [koke2, postaviKoke2] = useState("");
  const [kg1, postaviKg1] = useState("");
  const [dodKoke, postaviDodKoke] = useState("");
  const [dodKg, postaviDodKg] = useState("");
  const [preKoke, postaviPreKoke] = useState("");
  const [preKg, postaviPreKg] = useState("");
  const [predani, postaviPredani] = useState("");
  const [potvrda, postaviPotvrdu] = useState("");
  const [greska, postaviGresku] = useState("");
  const zauzeto = useRef(false);
  const pokusaj = useRef<{ kljuc: string; id: string } | null>(null);

  const zakljucan = pregled?.popis && !pregled.popis.zatvoreno ? pregled.popis : null;
  const cijene = pregled?.cijene;
  const brojevi = {
    dodatneKoke: cijeliIzUnosa(dodKoke),
    dodatnaJanjetinaKg: kolicinaIzUnosa(dodKg),
    preostaleKoke: cijeliIzUnosa(preKoke),
    preostalaJanjetinaKg: kolicinaIzUnosa(preKg),
    predaniPazar: novacIzUnosa(predani),
  };
  const potpis = JSON.stringify(brojevi);
  const preview =
    zakljucan && cijene?.koka != null && cijene.janjetina != null && !Object.values(brojevi).some(Number.isNaN)
      ? pregledPopisa({
          pocetneKokePecene: zakljucan.pocetneKokePecene,
          pocetneKokeSirove: zakljucan.pocetneKokeSirove,
          pocetnaJanjetinaKg: zakljucan.pocetnaJanjetinaKg,
          ...brojevi,
          cijenaKoke: cijene.koka,
          cijenaJanjetine: cijene.janjetina,
        })
      : null;

  // A ref, not state: two taps in the same frame both see the same render's state.
  async function posalji(metoda: "POST" | "PATCH", tijelo: object, kljuc: string) {
    if (zauzeto.current) return;
    zauzeto.current = true;
    postaviGresku("");
    try {
      const r = await pozovi("/api/pecenjara/smjena", PRIJAVA, metoda, { requestId: idPokusaja(pokusaj, kljuc), ...tijelo });
      if (!r.ok) return postaviGresku(r.greska);
      pokusaj.current = null;
      postaviPotvrdu("");
      await lista.iznova();
    } finally {
      zauzeto.current = false;
    }
  }

  function otvori(e: React.FormEvent) {
    e.preventDefault();
    const t = { pocetneKokePecene: cijeliIzUnosa(koke1), pocetneKokeSirove: cijeliIzUnosa(koke2), pocetnaJanjetinaKg: kolicinaIzUnosa(kg1) };
    if (Object.values(t).some(Number.isNaN)) return postaviGresku("Upišite sva tri broja. Pilići su cijeli brojevi, jagnjetina u kg, na primjer 12,5.");
    return posalji("POST", t, JSON.stringify(t));
  }

  function zatvori(e: React.FormEvent) {
    e.preventDefault();
    if (Object.values(brojevi).some(Number.isNaN)) return postaviGresku("Upišite svih pet brojeva. Pilići su cijeli brojevi, jagnjetina u kg, pazar u KM.");
    if (potvrda !== potpis) {
      postaviGresku("");
      return postaviPotvrdu(potpis);
    }
    return posalji("PATCH", { smjenaId: zakljucan?.smjenaId, ...brojevi }, potpis);
  }

  if (!pregled) return <p role="status">{lista.greska || "Učitavam…"}</p>;
  const ceka = potvrda === potpis;

  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="font-semibold text-greska">
        {greska || lista.greska}
      </p>

      {!pregled.smjena && <p>Nema otvorene smjene. Smjenu otvara konobar ili šefica na šanku.</p>}

      {pregled.smjena && !pregled.popis && (
        <form onSubmit={otvori} className="flex flex-col gap-3" aria-label="Početni popis">
          <h2 className="text-xl font-semibold">Početni popis, smjena {pregled.smjena.oznaka}</h2>
          <Polje oznaka="Pečeni pilići (komada)" vrijednost={koke1} postavi={postaviKoke1} />
          <Polje oznaka="Sirovi pilići (komada)" vrijednost={koke2} postavi={postaviKoke2} />
          <Polje oznaka="Jagnjetina (kg)" vrijednost={kg1} postavi={postaviKg1} />
          <button type="submit" className={glavno}>
            Otvori popis
          </button>
        </form>
      )}

      {zakljucan && (
        <form onSubmit={zatvori} className="flex flex-col gap-3" aria-label="Završni popis">
          <h2 className="text-xl font-semibold">Završni popis, smjena {pregled.smjena?.oznaka}</h2>
          <Sazetak p={zakljucan} />
          <Polje oznaka="Dodatni pilići (komada)" vrijednost={dodKoke} postavi={postaviDodKoke} />
          <Polje oznaka="Dodatna jagnjetina (kg)" vrijednost={dodKg} postavi={postaviDodKg} />
          <Polje oznaka="Preostali pilići (komada)" vrijednost={preKoke} postavi={postaviPreKoke} />
          <Polje oznaka="Preostala jagnjetina (kg)" vrijednost={preKg} postavi={postaviPreKg} />
          <Polje oznaka="Predani pazar (KM)" vrijednost={predani} postavi={postaviPredani} />
          <section aria-label="Pregled popisa" className="rounded-lg bg-povrsina p-3">
            {preview ? (
              <>
                <p>
                  Prodano: pilića {preview.prodaneKoke}, jagnjetina {formatBroj(preview.prodanaJanjetinaKg)} kg
                </p>
                <p>Pazar po popisu: {formatKM(preview.pazarPoPopisu)}</p>
                <p className="font-semibold">
                  Razlika (predano minus pazar po popisu): {formatKM(preview.razlika)}
                </p>
                {!preview.moguce && (
                  <p role="alert" className="font-semibold text-greska">
                    Završno stanje ne može biti veće od početnog i dodatnog.
                  </p>
                )}
              </>
            ) : cijene?.koka == null || cijene.janjetina == null ? (
              <p>U meniju nedostaje cijena pečenog pileta ili jagnjetine, pa pregled nije moguć.</p>
            ) : (
              <p>Upišite svih pet brojeva da vidite pregled.</p>
            )}
          </section>
          {ceka && (
            <p role="alert" className="font-semibold text-greska">
              Zaključani popis se ne može ispraviti. Provjerite brojeve i dodirnite ponovo da zaključite.
            </p>
          )}
          <button type="submit" className={glavno}>
            {ceka ? "Potvrdi i zaključaj popis" : "Zaključi popis"}
          </button>
        </form>
      )}

      {pregled.popis?.zatvoreno && (
        <section aria-label="Zaključan popis" className="flex flex-col gap-1 rounded-lg border-2 border-okvir p-3">
          <h2 className="text-xl font-semibold">Popis je zaključen</h2>
          <Sazetak p={pregled.popis} />
        </section>
      )}

      <section aria-label="Historija popisa" className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Historija</h2>
        {lista.stavke?.length === 0 && <p>Još nema zaključenih popisa.</p>}
        {lista.stavke?.map((p) => (
          <details key={p.smjenaId} className="rounded-lg border-2 border-okvir p-2">
            <summary className="flex min-h-12 items-center">
              {vrijemeSarajevo(p.otvoreno)}, razlika {formatKM(p.razlika ?? 0)}
            </summary>
            <Sazetak p={p} />
          </details>
        ))}
        {lista.imaJos && (
          <button type="button" onClick={lista.jos} className={dugme}>
            Starije
          </button>
        )}
      </section>
    </div>
  );
}
