"use client";

import { useEffect, useRef, useState } from "react";
import { dugme, glavno } from "@/components/konobar/stil";
import { redPoRedu } from "@/lib/offline/queue";
import { porukaUpozorenjaOdjave } from "@/lib/offline/odjava";

export default function Odjava() {
  const [greska, postaviGresku] = useState("");
  const [brojZaPotvrdu, postaviBrojZaPotvrdu] = useState<number | null>(null);
  const [provjeravam, postaviProvjeravam] = useState(false);
  const zauzeto = useRef(false);
  const pitanje = useRef<HTMLParagraphElement>(null);
  const dugmeOdjave = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (brojZaPotvrdu !== null) pitanje.current?.focus();
  }, [brojZaPotvrdu]);

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
      <div role="alert">{greska && <p className="alert alert-error font-bold">{greska}</p>}</div>
      {brojZaPotvrdu !== null && (
        <section role="alert" className="alert alert-warning flex flex-col items-start gap-2">
          <p ref={pitanje} tabIndex={-1} className="font-bold">{porukaUpozorenjaOdjave(brojZaPotvrdu)}</p>
          <p>
            Odjavom ostaju sačuvane na ovom uređaju. Šalju se tek kada se ponovo prijavi osoba koja ih je unijela; nakon 4 sata čekanja neće biti poslane.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={provjeravam} onClick={() => {
                postaviBrojZaPotvrdu(null);
                dugmeOdjave.current?.focus();
              }}
              className={dugme}
            >
              Odustani
            </button>
            <button type="button" disabled={provjeravam} onClick={potvrdiOdjavu} className={glavno}>
              {provjeravam ? "Provjeravam…" : "Odjavi se"}
            </button>
          </div>
        </section>
      )}
      <button ref={dugmeOdjave} type="button" disabled={provjeravam} onClick={provjeriRed} className={dugme}>
        Odjava
      </button>
    </>
  );
}
