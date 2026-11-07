"use client";

import { glavno, polje } from "@/components/konobar/stil";
import { useState } from "react";
import { formatKM } from "@/lib/format";
import type { Meni, Proizvod } from "./tipovi";

const bez = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").toLowerCase();

export function Kartica({ p, onDodaj }: { p: Proizvod; onDodaj?: (p: Proizvod) => void }) {
  return (
    <li className="mkartica">
      {p.slika && (
        // eslint-disable-next-line @next/next/no-img-element -- plain img by design; the credit is the hover text and is listed on the help page
        <img src={p.slika.putanja} alt="" loading="lazy" className="mitem-img" title={p.slika.zasluge ?? undefined} />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-lg leading-tight font-bold">{p.naziv}</p>
        <p className="text-dim">{p.jedinica}</p>
        <p className="tabelarno text-h3 font-extrabold text-primary">{formatKM(p.cijena)}</p>
      </div>
      {onDodaj && (
        <button type="button" onClick={() => onDodaj(p)} aria-label={`Dodaj: ${p.naziv}`} className={`${glavno} btn-square size-14 text-h2`}>
          +
        </button>
      )}
    </li>
  );
}

export default function MeniPrikaz({ meni, onDodaj }: { meni: Meni; onDodaj?: (p: Proizvod) => void }) {
  const [kategorija, postaviKategoriju] = useState(meni.kategorije[0]?.id);
  const [trazi, postaviTrazi] = useState("");

  const upit = bez(trazi.trim());
  const proizvodi = upit
    ? meni.kategorije.flatMap((k) => k.proizvodi).filter((p) => bez(p.naziv).includes(upit))
    : (meni.kategorije.find((k) => k.id === kategorija)?.proizvodi ?? []);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        Traži
        <input
          type="search"
          value={trazi}
          onChange={(e) => postaviTrazi(e.target.value)}
          autoComplete="off"
          className={polje}
        />
      </label>
      {!upit && (
        <div role="group" aria-label="Kategorije" className="flex flex-wrap gap-x-6 gap-y-1 border-b border-base-300">
          {meni.kategorije.map((k) => (
            <button key={k.id} type="button" className="mkat" aria-pressed={kategorija === k.id} onClick={() => postaviKategoriju(k.id)}>
              {k.naziv}
            </button>
          ))}
        </div>
      )}
      {proizvodi.length === 0 && <p role="status">Nema rezultata.</p>}
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {proizvodi.map((p) => (
          <Kartica key={p.id} p={p} onDodaj={onDodaj} />
        ))}
      </ul>
    </div>
  );
}
