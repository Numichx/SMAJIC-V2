import PopisPecenjare from "@/components/stanice/PopisPecenjare";

export const metadata = { title: "Popis pečenjare – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Popis pečenjare</h1>
      <PopisPecenjare />
    </>
  );
}
