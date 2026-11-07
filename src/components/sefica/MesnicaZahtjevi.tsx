"use client";

import { useState } from "react";
import { dugme } from "@/components/konobar/stil";
import { formatBroj } from "@/lib/format";
import { useSlanje, useUcitaj, zovi } from "./api";
import { formatVrijeme, kolicinaIzUnosa } from "./pomocno";
import { Greska, kartica, Polje, Strane } from "./ui";

type Zahtjev = {
  id: string;
  artikal: string;
  jedinica: string;
  trazeno: number | null;
  status: "nov" | "isporucen" | "nema_na_stanju";
  isporuceno: number | null;
  kreirao: string;
  kreirano: string;
  obradio: string | null;
  obradjeno: string | null;
};

function Obrada({ z, osvjezi }: { z: Zahtjev; osvjezi: () => void }) {
  const [kolicina, postaviKolicinu] = useState("");
  const [lokalno, postaviLokalno] = useState("");
  const { saljem, greska, posalji } = useSlanje();

  async function isporuci() {
    const k = kolicinaIzUnosa(kolicina, 3);
    if (Number.isNaN(k) || k <= 0 || k > 100000) return postaviLokalno("Unesite isporučenu količinu veću od nule, s najviše tri decimale.");
    postaviLokalno("");
    if (await posalji(`isporuci|${k}`, () => zovi("/api/zaliha/zahtjevi", "PATCH", { zahtjevId: z.id, radnja: "isporuci", kolicina: k }))) osvjezi();
  }
  async function nemaNaStanju() {
    postaviLokalno("");
    if (await posalji("nema", () => zovi("/api/zaliha/zahtjevi", "PATCH", { zahtjevId: z.id, radnja: "nema_na_stanju" }))) osvjezi();
  }

  return (
    <div className="flex flex-col gap-3">
      <Polje oznaka={`Isporučeno (${z.jedinica}) – ${z.artikal}`} vrijednost={kolicina} onChange={postaviKolicinu} />
      <Greska tekst={lokalno || greska} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={dugme} aria-disabled={saljem} aria-label={`Isporuči: ${z.artikal}`} onClick={isporuci}>
          Isporuči
        </button>
        <button type="button" className={dugme} aria-disabled={saljem} aria-label={`Nema na stanju: ${z.artikal}`} onClick={nemaNaStanju}>
          Nema na stanju
        </button>
      </div>
    </div>
  );
}

const STATUS = { nov: "Čeka", isporucen: "Isporučeno", nema_na_stanju: "Nema na stanju" };

// Polled every 10 s; each card keeps its own typed quantity, so a refresh does not wipe it.
export default function MesnicaZahtjevi({ poPromjeni }: { poPromjeni: () => void }) {
  const [strana, postaviStranu] = useState(1);
  const { podaci: p, greska, osvjezi, ucitano } = useUcitaj<{ zahtjevi: Zahtjev[]; imaJos: boolean }>(`/api/zaliha/zahtjevi?strana=${strana}`, 10000);
  const gotovo = () => {
    osvjezi();
    poPromjeni();
  };
  const cekaju = p?.zahtjevi.filter((z) => z.status === "nov") ?? [];
  const obradjeni = p?.zahtjevi.filter((z) => z.status !== "nov") ?? [];

  return (
    <section aria-label="Zahtjevi kuhinje" className="flex flex-col gap-3">
      <h3 className="text-lg font-bold">Zahtjevi kuhinje</h3>
      <Greska tekst={greska} />
      {!ucitano && !greska && <p role="status">Učitavam zahtjeve…</p>}
      {p && cekaju.length === 0 && <p>Nema zahtjeva koji čekaju.</p>}
      <ul className="flex flex-col gap-2">
        {cekaju.map((z) => (
          <li key={z.id} className={`${kartica} gap-2`}>
            <p className="text-lg font-bold break-words">{z.artikal}</p>
            <p>
              Traži: {z.kreirao}, {formatVrijeme(z.kreirano)} · Traženo: {z.trazeno === null ? "količina nije navedena" : `${formatBroj(z.trazeno)} ${z.jedinica}`}
            </p>
            <Obrada z={z} osvjezi={gotovo} />
          </li>
        ))}
      </ul>
      {obradjeni.length > 0 && (
        <>
          <h4 className="font-bold">Obrađeni zahtjevi</h4>
          <ul className="flex flex-col gap-2">
            {obradjeni.map((z) => (
              <li key={z.id} className={`${kartica} gap-1`}>
                <p className="font-bold break-words">
                  {z.artikal} · {STATUS[z.status]}
                  {z.isporuceno !== null && `: ${formatBroj(z.isporuceno)} ${z.jedinica}`}
                </p>
                <p>
                  Tražio {z.kreirao} ({formatVrijeme(z.kreirano)}), obradio {z.obradio} ({z.obradjeno ? formatVrijeme(z.obradjeno) : ""})
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      <Strane strana={strana} prethodna={strana > 1 ? () => postaviStranu(strana - 1) : undefined} sljedeca={p?.imaJos ? () => postaviStranu(strana + 1) : undefined} />
    </section>
  );
}
