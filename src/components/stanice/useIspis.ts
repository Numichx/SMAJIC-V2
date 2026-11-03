import { useEffect } from "react";

// Prints in place (see stampa.css) as soon as something to print is set, and clears it afterwards.
export function useIspis(sadrzaj: unknown, ocisti: () => void) {
  useEffect(() => {
    if (!sadrzaj) return;
    window.addEventListener("afterprint", ocisti);
    window.print();
    return () => window.removeEventListener("afterprint", ocisti);
  }, [sadrzaj, ocisti]);
}
