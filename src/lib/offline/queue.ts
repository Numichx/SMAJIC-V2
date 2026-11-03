import Dexie, { liveQuery, type EntityTable, type Table } from "dexie";
import { useEffect, useState } from "react";
import type { Meni } from "@/components/konobar/tipovi";

export type TijeloNarudzbe = {
  requestId: string;
  stoId: number;
  stavke: { proizvodId: string; kolicina: number; napomena?: string; prilozi?: { proizvodId: string; poseban?: boolean }[] }[];
};
// konobar is the name on the session that queued it. GET /api/sesija gives only the name, and names are unique.
// racunId is the bill the waiter saw, so a different one on send means that bill was closed or moved meanwhile.
export type Zapis = { id: number; konobar: string; tijelo: TijeloNarudzbe; opis: string; racunId?: string; vrijeme: number };
export type Izvjestaj = { id: number; poruka: string; vrijeme: number };

const db = new Dexie("smajic-offline") as Dexie & {
  red: EntityTable<Zapis, "id">;
  izvjestaji: EntityTable<Izvjestaj, "id">;
  meni: Table<{ kljuc: "zadnji"; meni: Meni }, string>;
};
db.version(1).stores({ red: "++id", izvjestaji: "++id", meni: "kljuc" });

// A special side needs the manager's PIN on send, and a PIN never goes into IndexedDB.
export const trebaVezu = (stavke: TijeloNarudzbe["stavke"]) => stavke.some((s) => s.prilozi?.some((x) => x.poseban));

// Only these fields are stored, whatever the caller passes.
export function tijeloZaRed({ requestId, stoId, stavke }: TijeloNarudzbe): TijeloNarudzbe {
  if (trebaVezu(stavke)) throw new Error("Poseban prilog ne ide u red.");
  return { requestId, stoId, stavke };
}

// Set by OfflineStatus, which gets it from the session on the server. No name means no queueing.
let konobar: string | null = null;
export const postaviKonobara = (ime: string | null) => {
  konobar = ime;
};
export const trenutniKonobar = () => konobar;

// Throws when IndexedDB is unavailable: the caller then keeps the order in the cart.
export async function dodajURed(tijelo: TijeloNarudzbe, opis: string, racunId: string | undefined) {
  if (!konobar) throw new Error("Nepoznat konobar.");
  await db.red.add({ konobar, tijelo: tijeloZaRed(tijelo), opis, racunId, vrijeme: Date.now() });
}

export const redPoRedu = () => db.red.orderBy("id").toArray();

// Inside one transaction, so two tabs answering for one entry leave one report.
export function ukloniIzReda(id: number, poruka?: string) {
  return db.transaction("rw", db.red, db.izvjestaji, async () => {
    if (!(await db.red.get(id))) return;
    await db.red.delete(id);
    if (poruka) await db.izvjestaji.add({ poruka, vrijeme: Date.now() });
  });
}

export const zatvoriIzvjestaj = (id: number) => db.izvjestaji.delete(id);

export const sacuvajMeni = (meni: Meni) => db.meni.put({ kljuc: "zadnji", meni });
export const procitajMeni = async () => (await db.meni.get("zadnji"))?.meni ?? null;

// Live across tabs. With IndexedDB unavailable it stays empty, and nothing can be queued either.
export function useRed() {
  const [stanje, postavi] = useState<{ red: Zapis[]; izvjestaji: Izvjestaj[] }>({ red: [], izvjestaji: [] });
  useEffect(() => {
    const pretplata = liveQuery(async () => ({ red: await redPoRedu(), izvjestaji: await db.izvjestaji.toArray() })).subscribe({
      next: postavi,
      error: () => {},
    });
    return () => pretplata.unsubscribe();
  }, []);
  return stanje;
}
