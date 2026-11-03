import DugPecenjare from "@/components/stanice/DugPecenjare";

export const metadata = { title: "Dugovi konobara – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Dugovi konobara</h1>
      <DugPecenjare />
    </>
  );
}
