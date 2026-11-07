"use client";

import { useEffect, useRef, useState } from "react";
import { dugme, glavno, polje } from "@/components/konobar/stil";
import { formatBroj } from "@/lib/format";
import { kolicinaIzUnosa } from "./brojevi";
import { idPokusaja, pozovi, useLista } from "./pozivi";
import { vrijemeSarajevo } from "./vrijeme";

const PRIJAVA = "/login?uloga=kuhinja";
type Artikal = { id: string; naziv: string; jedinica: string };
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
};

const STATUS = (z: Zahtjev) =>
  z.status === "nov" ? "Čeka mesnicu" : z.status === "isporucen" ? `Isporučeno: ${formatBroj(z.isporuceno ?? 0)} ${z.jedinica}` : "Nema na stanju";

export default function ZahtjevMesnici() {
  const [artikli, postaviArtikle] = useState<Artikal[] | null>(null);
  const [artikal, postaviArtikal] = useState("");
  const [kolicina, postaviKolicinu] = useState("");
  const [greska, postaviGresku] = useState("");
  const [poruka, postaviPoruku] = useState("");
  const zauzeto = useRef(false);
  const pokusaj = useRef<{ kljuc: string; id: string } | null>(null);
  const lista = useLista<Zahtjev, { zahtjevi: Zahtjev[]; imaJos: boolean }>("/api/zaliha/zahtjevi", "zahtjevi", PRIJAVA, 10_000);

  useEffect(() => {
    let zivo = true;
    pozovi<{ zaliha: Artikal[] }>("/api/zaliha", PRIJAVA).then((r) => zivo && (r.ok ? postaviArtikle(r.podaci.zaliha) : postaviGresku(r.greska)));
    return () => {
      zivo = false;
    };
  }, []);

  async function posalji(e: React.FormEvent) {
    e.preventDefault();
    const k = kolicina.trim() === "" ? null : kolicinaIzUnosa(kolicina);
    if (!artikal) return postaviGresku("Izaberite artikal.");
    if (k !== null && (Number.isNaN(k) || k <= 0)) return postaviGresku("Količina mora biti veća od nule, najviše tri decimale, ili ostavite prazno.");
    if (zauzeto.current) return;
    zauzeto.current = true;
    postaviGresku("");
    postaviPoruku("");
    try {
      const id = idPokusaja(pokusaj, JSON.stringify([artikal, k]));
      const r = await pozovi("/api/zaliha/zahtjevi", PRIJAVA, "POST", { requestId: id, zalihaId: artikal, ...(k !== null && { kolicina: k }) });
      if (!r.ok) return postaviGresku(r.greska);
      pokusaj.current = null;
      postaviKolicinu("");
      postaviPoruku("Zahtjev je poslan mesnici.");
      await lista.iznova();
    } finally {
      zauzeto.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={posalji} className="flex flex-col gap-3 rounded-box border-2 border-dim p-3" aria-label="Novi zahtjev">
        <h2 className="text-xl font-bold">Zahtjev mesnici</h2>
        <label className="flex flex-col gap-1">
          Artikal
          <select value={artikal} onChange={(e) => postaviArtikal(e.target.value)} className={polje}>
            <option value="">Izaberite…</option>
            {artikli?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.naziv} ({a.jedinica})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Količina (nije obavezna)
          <input inputMode="decimal" value={kolicina} onChange={(e) => postaviKolicinu(e.target.value)} className={polje} />
        </label>
        <button type="submit" className={glavno}>
          Pošalji zahtjev
        </button>
      </form>
      <p role="alert" className="font-bold text-error">
        {greska || lista.greska}
      </p>
      <p role="status">{poruka}</p>

      <section aria-label="Zahtjevi" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Zahtjevi</h2>
        {lista.stavke?.length === 0 && <p>Još nema zahtjeva.</p>}
        <ul className="flex flex-col gap-2">
          {lista.stavke?.map((z) => (
            <li key={z.id} className="card card-border border-dim bg-base-200 p-4">
              <strong>{z.artikal}</strong>, traženo: {z.trazeno === null ? "bez količine" : `${formatBroj(z.trazeno)} ${z.jedinica}`}
              <p>
                <span className="badge badge-lg badge-outline h-auto py-1 font-bold">{STATUS(z)}</span>
              </p>
              <p className="text-sm">
                {z.kreirao}, {vrijemeSarajevo(z.kreirano)}
                {z.obradio && `. Obradio: ${z.obradio}`}
              </p>
            </li>
          ))}
        </ul>
        {lista.imaJos && (
          <button type="button" onClick={lista.jos} className={dugme}>
            Stariji zahtjevi
          </button>
        )}
      </section>
    </div>
  );
}
