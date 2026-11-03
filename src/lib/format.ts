// Not Intl: a browser without bs-BA data would print a dot.
export function formatKM(iznos: number) {
  return `${iznos.toFixed(2).replace(".", ",")} KM`;
}
