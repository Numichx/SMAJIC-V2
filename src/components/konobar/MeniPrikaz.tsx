"use client";

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
      <p className="text-lg font-semibold">{p.naziv}</p>
      <p>
        {formatKM(p.cijena)}/{p.jedinica}
      </p>
      {onDodaj && (
        <button
          type="button"
          onClick={() => onDodaj(p)}
          className="min-h-12 rounded-lg bg-akcent px-4 font-semibold text-akcent-tekst"
        >
          Dodaj
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
          className="min-h-12 w-full rounded-lg border-2 border-okvir bg-background px-3 text-lg"
        />
      </label>
      {!upit && (
        <div role="group" aria-label="Kategorije" className="flex flex-wrap gap-2">
          {meni.kategorije.map((k) => (
            <button key={k.id} type="button" className="mkat" aria-pressed={kategorija === k.id} onClick={() => postaviKategoriju(k.id)}>
              {k.naziv}
            </button>
          ))}
        </div>
      )}
      {proizvodi.length === 0 && <p role="status">Nema rezultata.</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {proizvodi.map((p) => (
          <Kartica key={p.id} p={p} onDodaj={onDodaj} />
        ))}
      </ul>
    </div>
  );
}
