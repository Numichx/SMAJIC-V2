# Security checklist, end of phase 7

Checked on 2026-11-06 against production (<https://smajic-pos.vercel.app>) and commit `59127d4` plus this file's commit.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Hide API keys | Pass | The 8 client JavaScript files on production contain no Supabase URL, key or secret. `tests/sigurnost.test.ts` keeps the secret key inside `lib/supabase/admin.ts`. |
| 2 | Purge Git secrets | Pass | `.env*` is ignored except `.env.example`. A scan of all history for Supabase keys, JWTs, session secrets and Postgres URLs with passwords found none. |
| 3 | Use public DB key | Pass | The browser gets no key at all: no `NEXT_PUBLIC_*` variable is used (`tests/sigurnost.test.ts`). The Supabase integration adds `NEXT_PUBLIC_SUPABASE_*` on Vercel, but nothing reads them, so they never reach the browser. |
| 4 | Enable row-level security | Pass | Every table has RLS, no policies and no rights for `anon`, `authenticated` or `service_role`. The Supabase advisor reports only the intended "RLS enabled, no policy" notice. `rls_auto_enable` is closed in `20261106023647`. |
| 5 | Encrypt sensitive data | Pass | PINs are bcrypt hashes. Guest names and phones are cleared by the retention screen (`20261103001000_z_privatnost.sql`). Supabase and Vercel encrypt at rest and in transit. |
| 6 | Enforce server-side auth | Pass | Every route checks the session and role (`tests/sigurnost.test.ts`, "makes every API route validate"), and every SQL function re-checks the role and `aktivan`. |
| 7 | Lock record access | Pass | Only a waiter pays or voids, only the manager PIN approves a discount, stations move only their own orders. Covered in `tests/naplata.test.ts`, `tests/storno.test.ts` and `tests/stanice.test.ts`. Editing a payment is not built. |
| 8 | Block field tampering | Pass | Every body uses `z.strictObject`. Prices, totals, discounts and statuses come from SQL; payment refuses `ukupno`, `baksis` and similar fields. |
| 9 | Secure session cookies | Pass | `httpOnly`, `sameSite=lax`, `secure` in production, 18 hours, HMAC-signed (`lib/auth/session.ts`, `lib/auth/sessionToken.ts`). A new `SESSION_SECRET` logs everyone out. |
| 10 | Hash passwords | Pass | bcrypt through `pgcrypto`. No PIN is stored, logged or put in the repo. |
| 11 | Rate limit login | Pass | Per device, per IP and global lockouts on every PIN check, including the manager PIN for discounts and special sides (`20261102230200_pin_pokusaji.sql`, `20261103000400_racuni_naplata.sql`, `20261103000100_narudzbe.sql`). |
| 12 | Add bot protection | Pass | Vercel BotID guards login and first-PIN activation (`src/instrumentation-client.ts`, `lib/auth/covjek.ts`). On the staging preview a script and headless Edge got 403, a normal Edge window got through. |
| 13 | Parameterize queries | Pass | All data goes through `rpc` with bound arguments. The migrations contain no dynamic `execute`. |
| 14 | Validate all input | Pass | zod on every route, and the SQL functions check ranges, lengths and states again. |
| 15 | Escape user content | Pass | React renders all text; no raw HTML anywhere (`tests/sigurnost.test.ts`). Receipts print the same way. |
| 16 | Restrict file uploads | Not applicable | The app has no uploads. Photos are static files in `public/meni`. |
| 17 | Trim API responses | Pass | No response carries `pin_hash`, only `ima_pin`. Lists are paged at 50. Station queues carry no prices. |
| 18 | Add security headers | Pass | Production sends HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and a nonce CSP with `strict-dynamic`. |
| 19 | Force HTTPS | Pass | Vercel serves HTTPS only, with HSTS, `upgrade-insecure-requests` and secure cookies. |
| 20 | Scan dependencies | Pass | `npm audit --omit=dev` finds 0 vulnerabilities. CI runs it on every push (`ci.yml`) and weekly (`zavisnosti.yml`). Dev tools are left out because their only finding (minimatch) has no fix. |

## Still open

- **Fiscal device and VAT** are not built until the owner sends the device model and the rates.
- **Backups** are manual: `scripts/kopija.mjs`, see the README. The free Supabase plan keeps none.
- **Optimization basics:** the queue and report queries have their indexes, and the 3 s queue response carries no prices. No load test has been run.
