import Link from "next/link";
import { redirect } from "next/navigation";
import { jeOdjeljak } from "@/lib/auth/session";
import LoginForm from "./LoginForm";

export const metadata = { title: "Prijava – Smajić" };

const nazivi = {
  konobar: "Konobar",
  kuhinja: "Kuhinja",
  pecenjara: "Pečenjara",
  sank: "Šank",
  mesnica: "Mesnica",
  sefica: "Šefica",
  pomoc: "Pomoć",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ uloga?: string | string[] }> }) {
  const { uloga } = await searchParams;
  if (typeof uloga !== "string" || !jeOdjeljak(uloga) || uloga === "pomoc") redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Prijava – {nazivi[uloga]}</h1>
      <LoginForm uloga={uloga} />
      <Link href="/" className="flex min-h-12 items-center underline">
        Druga uloga
      </Link>
    </main>
  );
}
