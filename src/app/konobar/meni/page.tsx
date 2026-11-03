import MeniStranica from "@/components/konobar/MeniStranica";

export const metadata = { title: "Meni – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Meni</h1>
      <MeniStranica />
    </>
  );
}
