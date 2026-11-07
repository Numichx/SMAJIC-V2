"use client";

import { useEffect, useState } from "react";
import { dugme, glavno, izbor } from "@/components/konobar/stil";
import type { Uloga } from "@/lib/auth/session";
import { useSlanje, useUcitaj, zovi } from "./api";
import { Greska, Polje } from "./ui";

type Zaposlenik = { id: string; ime: string; uloga: Uloga; aktivan: boolean; ima_pin: boolean; ceka_aktivaciju: boolean };

const nazivi: Record<Uloga, string> = {
  konobar: "Konobar",
  kuhinja: "Kuhinja",
  pecenjara: "Pečenjara",
  mesnica: "Mesnica",
  sefica: "Šefica",
};
const ULOGE = Object.keys(nazivi) as Uloga[];

const imeNeispravno = (ime: string) => ime.trim().length < 2 || ime.trim().length > 80;

function UlogaIzbor({ vrijednost, onChange, onemoguceno }: { vrijednost: Uloga; onChange: (u: Uloga) => void; onemoguceno?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      Uloga
      <select className={izbor} value={vrijednost} disabled={onemoguceno} onChange={(e) => onChange(e.target.value as Uloga)}>
        {ULOGE.map((u) => (
          <option key={u} value={u}>
            {nazivi[u]}
          </option>
        ))}
      </select>
    </label>
  );
}

function NovaOsoba({ gotovo }: { gotovo: (poruka: string) => void }) {
  const [ime, postaviIme] = useState("");
  const [uloga, postaviUlogu] = useState<Uloga>("konobar");
  const [lokalno, postaviLokalno] = useState("");
  const { saljem, greska, posalji } = useSlanje();

  async function dodaj() {
    if (imeNeispravno(ime)) return postaviLokalno("Ime mora imati od 2 do 80 znakova.");
    postaviLokalno("");
    const r = await posalji(`${ime}|${uloga}`, () => zovi("/api/administracija/zaposlenici", "POST", { ime: ime.trim(), uloga }));
    if (r) {
      gotovo(`${ime.trim()} je dodan(a). Izdajte kod da izabere svoj PIN.`);
      postaviIme("");
    }
  }

  return (
    <section aria-label="Nova osoba" className="flex flex-col gap-3 rounded-lg border-2 border-okvir p-3">
      <h3 className="text-lg font-semibold">Dodaj osobu</h3>
      <Polje oznaka="Ime i prezime" vrijednost={ime} onChange={postaviIme} tip="text" maxLength={80} />
      <UlogaIzbor vrijednost={uloga} onChange={postaviUlogu} />
      <Greska tekst={lokalno || greska} />
      <div>
        <button type="button" className={glavno} aria-disabled={saljem} onClick={dodaj}>
          {saljem ? "Dodajem…" : "Dodaj osobu"}
        </button>
      </div>
    </section>
  );
}

function Izmjena({ z, jaSam, gotovo, zatvori }: { z: Zaposlenik; jaSam: boolean; gotovo: (poruka: string) => void; zatvori: () => void }) {
  const [ime, postaviIme] = useState(z.ime);
  const [uloga, postaviUlogu] = useState<Uloga>(z.uloga);
  const { saljem, greska, posalji } = useSlanje();
  const [lokalno, postaviLokalno] = useState("");
  const mijenjaUlogu = uloga !== z.uloga;

  async function spremi() {
    if (imeNeispravno(ime)) return postaviLokalno("Ime mora imati od 2 do 80 znakova.");
    postaviLokalno("");
    const r = await posalji(`${ime}|${uloga}`, () => zovi("/api/administracija/zaposlenici", "PATCH", { id: z.id, ime: ime.trim(), uloga }));
    if (r) {
      gotovo(mijenjaUlogu ? `${ime.trim()}: uloga je promijenjena, PIN je obrisan. Izdajte novi kod.` : `${ime.trim()}: izmjene su spremljene.`);
      zatvori();
    }
  }

  return (
    <section aria-label={`Izmjena: ${z.ime}`} className="flex flex-col gap-3 border-t-2 border-okvir pt-3">
      <Polje oznaka="Ime i prezime" vrijednost={ime} onChange={postaviIme} tip="text" maxLength={80} />
      <UlogaIzbor vrijednost={uloga} onChange={postaviUlogu} onemoguceno={jaSam} />
      {jaSam && <p>Svoju ulogu ne možete promijeniti.</p>}
      {mijenjaUlogu && (
        <p role="status" className="font-semibold">
          Promjena uloge briše PIN i prekida prijavu ove osobe. Trebat će joj novi kod.
        </p>
      )}
      <Greska tekst={lokalno || greska} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={glavno} aria-disabled={saljem} onClick={spremi}>
          {saljem ? "Spremam…" : mijenjaUlogu ? "Spremi i obriši PIN" : "Spremi"}
        </button>
        <button type="button" className={dugme} onClick={zatvori}>
          Odustani
        </button>
      </div>
    </section>
  );
}

export default function OsobljePanel() {
  const { podaci, greska: greskaUcitavanja, osvjezi, ucitano } = useUcitaj<{ zaposlenici: Zaposlenik[] }>("/api/administracija/zaposlenici");
  const [ja, postaviJa] = useState("");
  const [kod, postaviKod] = useState<{ ime: string; kod: string } | null>(null);
  const [poruka, postaviPoruku] = useState("");
  const [uredjuje, postaviUredjuje] = useState<string | null>(null);
  const [potvrdaDeaktivacije, postaviPotvrdu] = useState<string | null>(null);
  const [saljemId, postaviSaljemId] = useState<string | null>(null);
  const { greska: greskaAkcije, posalji } = useSlanje();

  // Names are unique, so the session's name tells which row is the manager herself.
  useEffect(() => {
    zovi<{ ime: string }>("/api/sesija").then((r) => r.ok && postaviJa(r.podaci.ime));
  }, []);

  const zaposlenici = podaci?.zaposlenici ?? [];

  async function noviPin(z: Zaposlenik) {
    postaviKod(null);
    postaviPoruku("");
    postaviSaljemId(z.id);
    const r = await posalji(`pin|${z.id}`, () => zovi<{ kod: string }>("/api/administracija/pin", "POST", { zaposlenikId: z.id }));
    postaviSaljemId(null);
    if (r) {
      postaviKod({ ime: z.ime, kod: r.kod });
      osvjezi();
    }
  }

  async function postaviAktivnost(z: Zaposlenik, aktivan: boolean) {
    postaviKod(null);
    postaviPoruku("");
    postaviPotvrdu(null);
    postaviSaljemId(z.id);
    const r = await posalji(`aktivnost|${z.id}|${aktivan}`, () => zovi("/api/administracija/zaposlenici", "PATCH", { id: z.id, aktivan }));
    postaviSaljemId(null);
    if (r) {
      postaviPoruku(aktivan ? `${z.ime} je ponovo aktivan(na).` : `${z.ime} je deaktiviran(a) i odmah je odjavljen(a).`);
      osvjezi();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Greska tekst={greskaUcitavanja || greskaAkcije} />
      {poruka && (
        <p role="status" className="font-semibold">
          {poruka}
        </p>
      )}
      {kod && (
        <section role="status" aria-label="Aktivacijski kod" className="rounded-lg border-2 border-akcent bg-povrsina p-4">
          <p className="font-semibold">{kod.ime}</p>
          <p aria-label={kod.kod.split("").join(" ")} className="my-2 text-4xl font-bold tracking-widest">{kod.kod}</p>
          <p>Kod vrijedi 15 minuta. Dajte ga zaposleniku da izabere svoj PIN.</p>
        </section>
      )}
      <NovaOsoba
        gotovo={(p) => {
          postaviPoruku(p);
          osvjezi();
        }}
      />
      {!ucitano && !greskaUcitavanja && <p role="status">Učitavam osoblje…</p>}
      {ucitano && zaposlenici.length === 0 && <p>Nema zaposlenika.</p>}
      <ul className="flex flex-col gap-2">
        {zaposlenici.map((z) => {
          const jaSam = z.ime === ja;
          return (
            <li key={z.id} className="flex flex-col gap-2 rounded-lg border-2 border-okvir p-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold break-words">{z.ime}</p>
                  <p>
                    {nazivi[z.uloga]} · {!z.aktivan ? "Neaktivan" : z.ceka_aktivaciju ? "Čeka aktivaciju" : z.ima_pin ? "Ima PIN" : "Nema PIN"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {z.aktivan && (
                    <button
                      type="button"
                      onClick={() => noviPin(z)}
                      aria-disabled={saljemId === z.id}
                      aria-label={`Izdaj kod za ${z.ime}`}
                      className={glavno}
                    >
                      {saljemId === z.id ? "Izdajem…" : "Izdaj kod"}
                    </button>
                  )}
                  <button
                    type="button"
                    className={dugme}
                    aria-expanded={uredjuje === z.id}
                    aria-label={`Uredi ${z.ime}`}
                    onClick={() => postaviUredjuje(uredjuje === z.id ? null : z.id)}
                  >
                    Uredi
                  </button>
                  {!z.aktivan && (
                    <button type="button" className={dugme} aria-disabled={saljemId === z.id} aria-label={`Aktiviraj ${z.ime}`} onClick={() => postaviAktivnost(z, true)}>
                      Aktiviraj
                    </button>
                  )}
                  {z.aktivan && !jaSam && potvrdaDeaktivacije !== z.id && (
                    <button type="button" className={dugme} aria-label={`Deaktiviraj ${z.ime}`} onClick={() => postaviPotvrdu(z.id)}>
                      Deaktiviraj
                    </button>
                  )}
                </div>
              </div>
              {potvrdaDeaktivacije === z.id && (
                <div className="flex flex-col gap-2 border-t-2 border-okvir pt-3">
                  <p className="font-semibold">{z.ime} će odmah biti odjavljen(a) i neće moći raditi dok ga ne aktivirate.</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={glavno} aria-disabled={saljemId === z.id} aria-label={`Potvrdi deaktivaciju ${z.ime}`} onClick={() => postaviAktivnost(z, false)}>
                      Potvrdi deaktivaciju
                    </button>
                    <button type="button" className={dugme} onClick={() => postaviPotvrdu(null)}>
                      Odustani
                    </button>
                  </div>
                </div>
              )}
              {uredjuje === z.id && (
                <Izmjena
                  z={z}
                  jaSam={jaSam}
                  zatvori={() => postaviUredjuje(null)}
                  gotovo={(p) => {
                    postaviPoruku(p);
                    postaviKod(null);
                    osvjezi();
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
