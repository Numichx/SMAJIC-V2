import RezervacijePanel from "@/components/konobar/RezervacijePanel";

export const metadata = { title: "Rezervacije – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Rezervacije</h1>
      <RezervacijePanel />
    </>
  );
}
