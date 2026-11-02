<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Smajić – Narudžbe

Restaurant POS. The UI is in Bosnian, prices are in KM, and one device is assigned to one role.

- All business logic lives in `security definer` plpgsql functions called through `rpc`. Every table has RLS with no policies, rights revoked from `anon` and `authenticated`, and execute granted to `service_role` only.
- Routes stay thin: check session and role, validate with zod, call one `rpc`, map the error. The browser only sees business errors (SQLSTATE P0001).
- Components only call the API and never import `lib/supabase`.
- Domain math is pure functions in `lib/domain` with tests. SQL mirrors it, and a test catches drift.
- Sensitive actions write to `dnevnik_radnji`. Regenerate `database.types.ts` after every migration.
- The server computes prices, totals and statuses, and never trusts the client's values.
- No secrets or PINs in the repo, in logs or in chat. Staff choose their own PINs.
- Styling stays minimal and in one place until the design pass (phase 7b).
