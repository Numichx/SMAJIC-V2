"use client";

import MeniPrikaz from "./MeniPrikaz";
import { useMeni } from "./useMeni";

export default function MeniStranica() {
  const { meni, greska } = useMeni();
  const sZaslugama = meni?.kategorije.flatMap((k) => k.proizvodi).filter((p) => p.slika?.zasluge) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="font-bold text-error">
        {greska}
      </p>
      {!meni && !greska && <p role="status">Učitavam meni…</p>}
      {meni && <MeniPrikaz meni={meni} />}
      {sZaslugama.length > 0 && (
        <details>
          <summary className="min-h-12 cursor-pointer font-bold">Zasluge za fotografije</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {sZaslugama.map((p) => (
              <li key={p.id}>
                {p.naziv}: {p.slika?.zasluge}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
