import RedStanice from "@/components/stanice/RedStanice";

export const metadata = { title: "Kuhinja – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Kuhinja</h1>
      <RedStanice stanica="kuhinja" />
    </>
  );
}
