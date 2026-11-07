"use client";

import { dugme, glavno } from "./stil";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { greskaIz } from "@/lib/api/greskaIz";
import { useIspis } from "@/components/stanice/useIspis";
import { formatBroj, formatKM } from "@/lib/format";
import type { Placeno } from "./Naplata";
import { NEMA_VEZE, PRIJAVA } from "./useMeni";

type Stampa = {
  broj: number;
  status: string;
  otvoren: string;
  zatvoren: string | null;
  konobar: string;
  stolovi: number[];
  bruto: number;
  popust: { procenat: number; razlog: string | null; iznos: number } | null;
  ukupno: number;
  stavke: { naziv: string; jedinica: string; kolicina: number; cijena: number; iznos: number; prilog: boolean }[];
  naplata: Placeno | null;
};

const NACIN: Record<string, string> = { gotovina: "Gotovina", kartica: "Kartica", kombinovano: "Gotovina i kartica", dug: "Na dug" };

function Red({ lijevo, desno }: { lijevo: string; desno: string }) {
  return (
    <div className="stampa-red">
      <span>{lijevo}</span>
      <span>{desno}</span>
    </div>
  );
}

function Listic({ r }: { r: Stampa }) {
  const n = r.naplata;
  return createPortal(
    <div className="stampa">
      <p>
        <strong>Račun {r.broj}</strong>
      </p>
      <p>Sto: {r.stolovi.join(", ")}</p>
      <p>Konobar: {r.konobar}</p>
      <p>{new Date(r.zatvoren ?? r.otvoren).toLocaleString("bs-BA")}</p>
      <hr />
      {r.stavke.map((s, i) => (
        <Red key={i} lijevo={s.prilog ? `  + ${s.naziv}` : `${formatBroj(s.kolicina)} ${s.jedinica} ${s.naziv}`} desno={s.prilog && s.cijena === 0 ? "uključeno" : formatKM(s.iznos)} />
      ))}
      <hr />
      {r.popust && (
        <>
          <Red lijevo="Ukupno bez popusta" desno={formatKM(r.bruto)} />
          <Red lijevo={`Popust ${formatBroj(r.popust.procenat)} %`} desno={`-${formatKM(r.popust.iznos)}`} />
        </>
      )}
      <div className="font-bold">
        <Red lijevo="Za platiti" desno={formatKM(r.ukupno)} />
      </div>
      {n && (
        <>
          <Red lijevo="Način" desno={NACIN[n.nacin] ?? n.nacin} />
          {n.gotovina > 0 && <Red lijevo="Gotovina" desno={formatKM(n.gotovina)} />}
          {n.kartica > 0 && <Red lijevo="Kartica" desno={formatKM(n.kartica)} />}
          {n.kusur > 0 && <Red lijevo="Kusur" desno={formatKM(n.kusur)} />}
          {n.baksis > 0 && <Red lijevo="Baksiš" desno={formatKM(n.baksis)} />}
          {n.podjela && (
            <>
              <p>Podijeljeno na {n.podijeljenoNa}:</p>
              {n.podjela.map((u, i) => (
                <Red key={i} lijevo={`Osoba ${i + 1}`} desno={formatKM(u)} />
              ))}
            </>
          )}
        </>
      )}
      <hr />
      <p>Ovo nije fiskalni račun</p>
    </div>,
    document.body,
  );
}

export default function NaplacenRacun({ p }: { p: Placeno }) {
  const [stampa, postaviStampu] = useState<Stampa | null>(null);
  const [greska, postaviGresku] = useState("");
  const zauzeto = useRef(false);
  const ocisti = useCallback(() => postaviStampu(null), []);

  useIspis(stampa, ocisti);

  async function ispisi() {
    if (zauzeto.current) return;
    zauzeto.current = true;
    postaviGresku("");
    try {
      const odgovor = await fetch(`/api/racuni/${p.racunId}/stampa`);
      if (odgovor.status === 401) return window.location.assign(PRIJAVA);
      if (!odgovor.ok) postaviGresku(await greskaIz(odgovor));
      else postaviStampu((await odgovor.json()).racun);
    } catch {
      postaviGresku(NEMA_VEZE);
    } finally {
      zauzeto.current = false;
    }
  }

  return (
    <section aria-label="Naplaćeno" className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">Račun je {p.nacin === "dug" ? "upisan na dug" : "naplaćen"}</h2>
      <p>Način: {NACIN[p.nacin] ?? p.nacin}</p>
      {p.popust > 0 && <p>Ukupno bez popusta: {formatKM(p.bruto)} · popust: {formatKM(p.popust)}</p>}
      <p className="text-xl font-bold">Ukupno: {formatKM(p.ukupno)}</p>
      {p.gotovina > 0 && <p>Gotovina: {formatKM(p.gotovina)}</p>}
      {p.kartica > 0 && <p>Kartica: {formatKM(p.kartica)}</p>}
      {p.kusur > 0 && <p>Kusur: {formatKM(p.kusur)}</p>}
      {p.baksis > 0 && <p>Baksiš: {formatKM(p.baksis)}</p>}
      {p.podjela && (
        <ul aria-label="Udjeli po osobi">
          {p.podjela.map((u, i) => (
            <li key={i}>
              Osoba {i + 1}: {formatKM(u)}
            </li>
          ))}
        </ul>
      )}
      <p role="alert" className="font-bold text-error">
        {greska}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={dugme} onClick={ispisi}>
          Ispiši račun
        </button>
        <Link href="/konobar" className={glavno}>
          Nazad na stolove
        </Link>
      </div>
      {stampa && <Listic r={stampa} />}
    </section>
  );
}
