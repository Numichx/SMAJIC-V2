import PopisPecenjare from "@/components/sefica/PopisPecenjare";

export const metadata = { title: "Popis pečenjare – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Popis pečenjare</h1>
      <PopisPecenjare />
    </>
  );
}
