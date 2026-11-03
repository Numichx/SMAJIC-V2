import Link from "next/link";
import RedStanice from "@/components/stanice/RedStanice";
import { dugme } from "@/components/konobar/stil";

export const metadata = { title: "Šank – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Šank</h1>
      <p className="mb-4">
        <Link href="/sank/smjena" className={`${dugme} inline-flex items-center`}>
          Smjena šanka (popis, dopune, zatvaranje)
        </Link>
      </p>
      <RedStanice stanica="sank" />
    </>
  );
}
