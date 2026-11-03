import RedStanice from "@/components/stanice/RedStanice";

export const metadata = { title: "Šank – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Šank</h1>
      <RedStanice stanica="sank" />
    </>
  );
}
