import { sesijaStranice } from "@/lib/auth/requestSession";
import type { Odjeljak, Uloga } from "@/lib/auth/session";
import ObavijestiKonobara from "@/components/konobar/ObavijestiKonobara";
import DemoStatus from "./DemoStatus";
import Navigacija from "./Navigacija";
import Odjava from "./Odjava";
import OfflineStatus from "./OfflineStatus";
import PrekidacTeme from "./PrekidacTeme";

const navigacija: Record<Uloga, { href: string; naziv: string }[]> = {
  konobar: [
    { href: "/konobar", naziv: "Stolovi" },
    { href: "/konobar/meni", naziv: "Meni" },
    { href: "/sank", naziv: "Šank" },
    { href: "/konobar/rezervacije", naziv: "Rezervacije" },
    { href: "/konobar/statistika", naziv: "Moja statistika" },
  ],
  kuhinja: [
    { href: "/kuhinja", naziv: "Red narudžbi" },
    { href: "/kuhinja/mesnica", naziv: "Mesnica" },
  ],
  pecenjara: [
    { href: "/pecenjara", naziv: "Red narudžbi" },
    { href: "/pecenjara/popis", naziv: "Popis" },
    { href: "/pecenjara/dugovi", naziv: "Dugovi" },
  ],
  mesnica: [{ href: "/mesnica", naziv: "Mesnica" }],
  sefica: [
    { href: "/sefica", naziv: "Izvještaji" },
    { href: "/sefica/dan", naziv: "Zatvaranje dana" },
    { href: "/sefica/smjene", naziv: "Smjene" },
    { href: "/sefica/pecenjara", naziv: "Popis pečenjare" },
    { href: "/sefica/zaliha", naziv: "Zaliha" },
    { href: "/sefica/recepti", naziv: "Recepti" },
    { href: "/sefica/meni", naziv: "Meni" },
    { href: "/sefica/dugovi", naziv: "Dugovi" },
    { href: "/sefica/administracija", naziv: "Osoblje" },
    { href: "/sefica/dnevnik", naziv: "Dnevnik" },
    { href: "/sank", naziv: "Šank" },
  ],
};

export default async function AppShell({ odjeljak, children }: { odjeljak: Odjeljak; children: React.ReactNode }) {
  const sesija = await sesijaStranice(odjeljak);

  return (
    <>
      <DemoStatus />
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-okvir p-3">
        <strong className="text-lg">Smajić – Narudžbe</strong>
        <span>{sesija.ime}</span>
        <Navigacija veze={navigacija[sesija.uloga]} />
        <div className="ml-auto flex gap-2">
          <PrekidacTeme />
          <Odjava />
        </div>
      </header>
      {sesija.uloga === "konobar" && <OfflineStatus konobar={sesija.ime} />}
      {sesija.uloga === "konobar" && <ObavijestiKonobara />}
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </>
  );
}
