import Link from "next/link";

const uloge = [
  { href: "/konobar", naziv: "Konobar" },
  { href: "/kuhinja", naziv: "Kuhinja" },
  { href: "/pecenjara", naziv: "Pečenjara" },
  { href: "/sank", naziv: "Šank" },
  { href: "/mesnica", naziv: "Mesnica" },
  { href: "/sefica", naziv: "Šefica" },
];

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Smajić – Narudžbe</h1>
      <nav aria-label="Uloge" className="grid gap-4 sm:grid-cols-2">
        {uloge.map((u) => (
          <Link
            key={u.href}
            href={u.href}
            className="flex min-h-20 items-center justify-center rounded-lg border-2 border-okvir bg-povrsina text-xl font-semibold"
          >
            {u.naziv}
          </Link>
        ))}
      </nav>
    </main>
  );
}
