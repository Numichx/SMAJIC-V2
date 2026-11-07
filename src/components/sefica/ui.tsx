import { dugme, polje } from "@/components/konobar/stil";
import type { ReactNode } from "react";

// An editable record: one card per row, never a table row.
export const kartica = "card card-border border-dim bg-base-200 p-4";
// The confirming button of a destructive action; its trigger stays a plain dugme.
export const opasno = "btn btn-lg btn-error font-bold aria-disabled:cursor-progress";

// A wide table scrolls inside its own box, so the page never scrolls sideways.
// Text columns (by index) are left-aligned; every other column holds numbers and is right-aligned.
export function Tabela({
  naslov,
  kolone,
  redovi,
  prazno,
  tekstKolone = [0],
}: {
  naslov: string;
  kolone: string[];
  redovi: ReactNode[][];
  prazno: string;
  tekstKolone?: number[];
}) {
  const poravnanje = (i: number) => (tekstKolone.includes(i) ? "text-left" : "text-right tabelarno");
  return (
    <section aria-label={naslov} className="flex flex-col gap-2">
      <h3 className="text-lg font-bold">{naslov}</h3>
      {redovi.length === 0 ? (
        <p>{prazno}</p>
      ) : (
        <div tabIndex={0} role="region" aria-label={`${naslov} (tabela)`} className="overflow-x-auto rounded-box border-2 border-dim">
          <table className="table table-zebra w-full min-w-max text-tijelo lg:text-tabela">
            <thead>
              <tr>
                {kolone.map((k, i) => (
                  <th key={k} scope="col" className={poravnanje(i)}>
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {redovi.map((red, i) => (
                <tr key={i}>
                  {red.map((c, j) => (
                    <td key={j} className={poravnanje(j)}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// The one pager: a missing handler means there is no page that way.
export function Strane({ strana, prethodna, sljedeca }: { strana: number; prethodna?: () => void; sljedeca?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={dugme} disabled={!prethodna} onClick={prethodna}>
        Prethodna
      </button>
      <span>Strana {strana}</span>
      <button type="button" className={dugme} disabled={!sljedeca} onClick={sljedeca}>
        Sljedeća
      </button>
    </div>
  );
}

export function Polje({
  oznaka,
  vrijednost,
  onChange,
  tip = "decimal",
  maxLength,
}: {
  oznaka: string;
  vrijednost: string;
  onChange: (v: string) => void;
  tip?: "decimal" | "numeric" | "text";
  maxLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      {oznaka}
      <input
        className={polje}
        value={vrijednost}
        onChange={(e) => onChange(e.target.value)}
        inputMode={tip}
        maxLength={maxLength}
        autoComplete="off"
      />
    </label>
  );
}

// The live region stays mounted; only the child that holds text gets the alert look.
export function Greska({ tekst }: { tekst: string }) {
  return <div role="alert">{tekst && <p className="alert alert-error font-bold">{tekst}</p>}</div>;
}

export function Podaci({ stavke }: { stavke: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4">
      {stavke.map(([k, v]) => (
        <div key={k} className="col-span-2 grid grid-cols-subgrid border-b border-dim py-1">
          <dt>{k}</dt>
          <dd className="tabelarno text-right font-bold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
