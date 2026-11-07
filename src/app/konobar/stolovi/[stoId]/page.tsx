import Link from "next/link";
import NarudzbaEditor from "@/components/konobar/NarudzbaEditor";

export const metadata = { title: "Sto – Smajić" };

export default async function Page({ params }: { params: Promise<{ stoId: string }> }) {
  const { stoId } = await params;
  const id = /^\d{1,2}$/.test(stoId) ? Number(stoId) : 0;

  if (id < 1 || id > 20) {
    return (
      <>
        <p role="alert" className="font-bold text-error">
          Sto ne postoji. Stolovi su od 1 do 20.
        </p>
        <Link href="/konobar" className="inline-flex min-h-12 items-center underline">
          Nazad na stolove
        </Link>
      </>
    );
  }
  return <NarudzbaEditor key={id} stoId={id} />;
}
