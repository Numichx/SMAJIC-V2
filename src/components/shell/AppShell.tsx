import Link from "next/link";
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
    { href: "/sefica/z", naziv: "Z-izvještaj" },
    { href: "/sefica/privatnost", naziv: "Privatnost" },
    { href: "/sank", naziv: "Šank" },
  ],
};

export default async function AppShell({ odjeljak, children }: { odjeljak: Odjeljak; children: React.ReactNode }) {
  const sesija = await sesijaStranice(odjeljak);
  // Waiters carry phones: their navigation moves to a bottom bar.
  const dno = sesija.uloga === "konobar";
  // Station screens are wall-mounted tablets: give the ticket rail the full width.
  const stanica = odjeljak === "kuhinja" || odjeljak === "pecenjara" || odjeljak === "mesnica";
  // Everyone else gets a sidebar from md up; stations keep the top bar so the queue has the width.
  const bocno = !stanica;

  return (
    <>
      <a href="#sadrzaj" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-base-content focus:p-3 focus:font-bold focus:text-base-100">
        Preskoči na sadržaj
      </a>
      <DemoStatus />
      <div className={`flex flex-1 flex-col ${bocno ? "md:flex-row" : ""}`}>
        <header
          className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b-2 border-dim bg-base-200 p-2 md:gap-x-4 md:p-3 ${
            bocno ? "md:sticky md:top-0 md:h-dvh md:w-60 md:flex-none md:flex-col md:flex-nowrap md:items-stretch md:gap-4 md:overflow-y-auto md:border-b-0 md:p-5" : ""
          }`}
        >
          <strong className={`flex flex-col leading-none text-primary ${dno ? "max-md:hidden" : ""}`}>
            <span className="text-2xl font-extrabold">Smajić</span>
            <span className="text-sm font-semibold tracking-widest">NARUDŽBE</span>
          </strong>
          <span className="font-semibold">{sesija.ime}</span>
          <Navigacija veze={dno ? navigacija.konobar : [...navigacija[sesija.uloga], { href: "/pomoc", naziv: "Pomoć" }]} dno={dno} bocno={bocno} />
          {/* On a phone every pixel above the content counts: same buttons, 44 px instead of 48. */}
          <div className={`ml-auto flex gap-2 max-md:[&_.btn]:h-11 max-md:[&_.btn]:px-3 max-md:[&_.btn]:text-sm ${bocno ? "md:mt-auto md:ml-0 md:flex-col" : ""}`}>
            {/* Six tabs do not fit a phone's bottom bar, so the waiter's Pomoć sits up here. */}
            {dno && (
              <Link href="/pomoc" className="btn btn-lg btn-outline border-dim font-bold">
                Pomoć
              </Link>
            )}
            <PrekidacTeme />
            <Odjava />
          </div>
        </header>
        <div className="flex min-w-0 flex-1 flex-col">
          {sesija.uloga === "konobar" && <OfflineStatus konobar={sesija.ime} />}
          {sesija.uloga === "konobar" && <ObavijestiKonobara />}
          <main id="sadrzaj" tabIndex={-1} className={`mx-auto w-full flex-1 p-4 md:p-6 ${stanica ? "max-w-screen-2xl" : "max-w-5xl"}${dno ? " pb-24 md:pb-6" : ""}`}>{children}</main>
        </div>
      </div>
    </>
  );
}
