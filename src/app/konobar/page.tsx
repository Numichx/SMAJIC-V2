import StoloviPregled from "@/components/konobar/StoloviPregled";
import { sesijaStranice } from "@/lib/auth/requestSession";

export const metadata = { title: "Konobar – Smajić" };

export default async function Page() {
  const sesija = await sesijaStranice("konobar");
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold max-md:sr-only">Stolovi</h1>
      <StoloviPregled ja={sesija.ime} />
    </>
  );
}
