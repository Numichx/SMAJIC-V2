"use client";

import { useRef, useState } from "react";
import { dugme, glavno } from "@/components/konobar/stil";
import { redPoRedu } from "@/lib/offline/queue";
import { porukaUpozorenjaOdjave } from "@/lib/offline/odjava";

export default function Odjava() {
  const [greska, postaviGresku] = useState("");
  const [brojZaPotvrdu, postaviBrojZaPotvrdu] = useState<number | null>(null);
  const [provjeravam, postaviProvjeravam] = useState(false);
  const zauzeto = useRef(false);

  async function posaljiOdjavu() {
    postaviGresku("");
    try {
      const odgovor = await fetch("/api/sesija", { method: "DELETE" });
      if (odgovor.ok) {
        window.location.assign("/");
        return;
      }
    } catch {
      postaviGresku("Odjava nije uspjela. Provjerite vezu i pokušajte ponovo.");
      return;
    }
    postaviGresku("Odjava nije uspjela. Provjerite vezu i pokušajte ponovo.");
  }

  async function brojNaCekanju() {
    try {
      return (await redPoRedu()).length;
    } catch {
      postaviGresku("Nije moguće provjeriti narudžbe na čekanju. Odjava nije izvršena; pokušajte ponovo.");
      return null;
    }
  }

  async function provjeriRed() {
    if (zauzeto.current) return;
    zauzeto.current = true;
    postaviProvjeravam(true);
    postaviGresku("");
    try {
      const broj = await brojNaCekanju();
      if (broj === null) return;
      const upozorenje = porukaUpozorenjaOdjave(broj);
      if (upozorenje) {
        postaviBrojZaPotvrdu(broj);
        return;
      }
      await posaljiOdjavu();
    } finally {
      zauzeto.current = false;
      postaviProvjeravam(false);
    }
  }

  async function potvrdiOdjavu() {
    if (zauzeto.current || brojZaPotvrdu === null) return;
    zauzeto.current = true;
    postaviProvjeravam(true);
    postaviGresku("");
    try {
      const broj = await brojNaCekanju();
      if (broj === null) return;
      if (broj > brojZaPotvrdu) {
        postaviBrojZaPotvrdu(broj);
        return;
      }
      await posaljiOdjavu();
    } finally {
      zauzeto.current = false;
      postaviProvjeravam(false);
    }
  }

  return (
    <>
      <p role="alert" className="font-semibold text-greska">
        {greska}
      </p>
      {brojZaPotvrdu !== null && (
        <section role="alert" className="flex flex-col gap-2 rounded-lg border-2 border-greska bg-povrsina p-3">
          <p className="font-semibold">{porukaUpozorenjaOdjave(brojZaPotvrdu)}</p>
          <p>
            Odjavom ostaju sačuvane na ovom uređaju. Šalju se tek kada se ponovo prijavi osoba koja ih je unijela; nakon 4 sata čekanja neće biti poslane.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={provjeravam} onClick={() => postaviBrojZaPotvrdu(null)} className={dugme}>
              Otkaži odjavu
            </button>
            <button type="button" disabled={provjeravam} onClick={potvrdiOdjavu} className={glavno}>
              {provjeravam ? "Provjeravam…" : "Odjavi se"}
            </button>
          </div>
        </section>
      )}
      <button type="button" disabled={provjeravam} onClick={provjeriRed} className="min-h-12 rounded-lg border-2 border-okvir px-4">
        Odjava
      </button>
    </>
  );
}
