import { sesijaStranice } from "@/lib/auth/requestSession";
import type { Odjeljak, Uloga } from "@/lib/auth/session";
import ObavijestiKonobara from "@/components/konobar/ObavijestiKonobara";
import DemoStatus from "./DemoStatus";
import Navigacija from "./Navigacija";
import Odjava from "./Odjava";
import PrekidacTeme from "./PrekidacTeme";

const navigacija: Record<Uloga, { href: string; naziv: string }[]> = {
  konobar: [
    { href: "/konobar", naziv: "Stolovi" },
    { href: "/konobar/meni", naziv: "Meni" },
    { href: "/sank", naziv: "Šank" },
  ],
  kuhinja: [{ href: "/kuhinja", naziv: "Red narudžbi" }],
  pecenjara: [{ href: "/pecenjara", naziv: "Red narudžbi" }],
  mesnica: [{ href: "/mesnica", naziv: "Mesnica" }],
  sefica: [
    { href: "/sefica", naziv: "Pregled" },
    { href: "/sefica/administracija", naziv: "Administracija" },
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
      {sesija.uloga === "konobar" && <ObavijestiKonobara />}
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </>
  );
}
