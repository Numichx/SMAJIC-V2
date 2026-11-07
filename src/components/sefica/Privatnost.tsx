"use client";

import { useState } from "react";
import { dugme } from "@/components/konobar/stil";
import { formatBroj } from "@/lib/format";
import { useSlanje, zovi } from "./api";
import { Greska, opasno, Polje } from "./ui";
import { daniIzUnosa, tijeloAnonimizacije } from "./privatnostPomocno";

type Rezultat = { dugovi: number; rezervacije: number; daniDugovi: number; daniRezervacije: number };

export default function Privatnost() {
  const [daniDugovi, postaviDaneDugovi] = useState("365");
  const [daniRezervacije, postaviDaneRezervacije] = useState("90");
  const [potvrda, postaviPotvrdu] = useState(false);
  const [rezultat, postaviRezultat] = useState<Rezultat | null>(null);
  const [lokalnaGreska, postaviLokalnuGresku] = useState("");
  const { saljem, greska, postaviGresku, posalji } = useSlanje();
  const rokDugovi = daniIzUnosa(daniDugovi);
  const rokRezervacije = daniIzUnosa(daniRezervacije);

  function promijeni(setter: (v: string) => void, vrijednost: string) {
    setter(vrijednost);
    postaviPotvrdu(false);
    postaviRezultat(null);
    postaviLokalnuGresku("");
    postaviGresku("");
  }

  function pripremiPotvrdu() {
    const dugovi = daniIzUnosa(daniDugovi);
    const rezervacije = daniIzUnosa(daniRezervacije);
    if (dugovi === null || rezervacije === null) {
      postaviLokalnuGresku("Rokovi moraju biti cijeli broj od 30 do 3.650 dana.");
      return;
    }
    postaviLokalnuGresku("");
    postaviPotvrdu(true);
  }

  async function anonimiziraj() {
    const dugovi = daniIzUnosa(daniDugovi);
    const rezervacije = daniIzUnosa(daniRezervacije);
    if (dugovi === null || rezervacije === null) {
      postaviPotvrdu(false);
      postaviLokalnuGresku("Rokovi moraju biti cijeli broj od 30 do 3.650 dana.");
      return;
    }

    postaviLokalnuGresku("");
    const odgovor = await posalji(`${dugovi}|${rezervacije}`, async () => {
      const r = await zovi<{ rezultat: Rezultat }>("/api/administracija/privatnost", "POST", {
        ...tijeloAnonimizacije(dugovi, rezervacije),
      });
      return r.ok ? { ok: true as const, podaci: r.podaci.rezultat } : r;
    });
    if (odgovor) {
      postaviRezultat(odgovor);
      postaviPotvrdu(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p>
        Imena na naplaćenim dugovima starijim od {rokDugovi === null ? daniDugovi || "365" : formatBroj(rokDugovi)} dana
        zamjenjuju se oznakom „Anonimizirano“. Kod rezervacija starijih od {rokRezervacije === null ? daniRezervacije || "90" : formatBroj(rokRezervacije)} dana
        ime se zamjenjuje istom oznakom, a telefon i napomena se brišu.
        Otvoreni dugovi se ne diraju. Ne obuhvata imena zaposlenih, napomene narudžbi ni sigurnosne kopije.
      </p>
      <p className="font-bold">Ovo se ne može poništiti i nema pregleda podataka prije izmjene.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Polje
          oznaka="Rok za naplaćene dugove (dani)"
          vrijednost={daniDugovi}
          onChange={(v) => promijeni(postaviDaneDugovi, v)}
          tip="numeric"
        />
        <Polje
          oznaka="Rok za rezervacije (dani)"
          vrijednost={daniRezervacije}
          onChange={(v) => promijeni(postaviDaneRezervacije, v)}
          tip="numeric"
        />
      </div>
      <p>Dozvoljeni rok je 30 do 3.650 dana. Zadane vrijednosti su 365 i 90 dana; provjerite da odgovaraju pravilima poslovanja.</p>
      <Greska tekst={lokalnaGreska || greska} />
      {!potvrda ? (
        <div>
          <button type="button" className={dugme} disabled={saljem} onClick={() => { postaviRezultat(null); pripremiPotvrdu(); }}>
            Nastavi na potvrdu
          </button>
        </div>
      ) : (
        <section aria-label="Potvrda anonimizacije" className="flex flex-col gap-3">
          <p className="alert alert-warning font-bold">
            Potvrdite: anonimizirati naplaćene dugove starije od {formatBroj(rokDugovi ?? 365)} dana
            i rezervacije starije od {formatBroj(rokRezervacije ?? 90)} dana?
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={opasno} disabled={saljem} onClick={anonimiziraj}>
              {saljem ? "Obrađujem…" : "Anonimiziraj"}
            </button>
            <button type="button" className={dugme} onClick={() => postaviPotvrdu(false)}>
              Odustani
            </button>
          </div>
        </section>
      )}
      {rezultat && (
        <p role="status" className="font-bold">
          Završeno: anonimizirani dugovi {rezultat.dugovi}, rezervacije {rezultat.rezervacije}. Rokovi: {rezultat.daniDugovi} i {rezultat.daniRezervacije} dana.
        </p>
      )}
    </div>
  );
}
