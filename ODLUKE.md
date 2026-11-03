# Decisions for the owner to check

The app was built with full authority to choose. These are the choices that affect money, security or how staff work. Each one can be changed.

## Please confirm before real use

| What | Current behaviour | Why it needs you |
|---|---|---|
| Special side ("poseban prilog") | Needs the manager's PIN, and the guest pays menu price. Taken from the old app. | It changes what guests pay. It may have been meant as a free exception. |
| Free sides | The first side on the dish's free list is free. Any further side is charged at menu price. | The old screen allowed one free side, and the old database allowed four. |
| Which sides are free with which dish | Copied from the old app. Fries with made-to-order dishes, chicken and grill (except ćevapi and sudžukice); vegetables with lešo; mashed potato, rice or macaroni with gulaš; fries or potato salad with fish; roast potato or fries with teletina ispod sača. | Check it still matches the current menu. |
| Lockout limits | 5 wrong PINs per device (5 min), 20 per IP (15 min), 100 overall (15 min). | The prompt says 5 everywhere, but the restaurant shares one IP, so that would let one person lock out every device. |
| Menu prices | Exactly as in `menu-export.csv`, which says it came from the old app's seed data. | Check them against the real menu. |

## Security choices

- **Cache Components is off.** The strict browser security policy (CSP) needs each page rendered per request.
- **No public Supabase variables.** The browser never talks to the database, so it holds no key.
- **First PINs use a 6-digit code** that lasts 15 minutes and works once. The manager issues codes, and a new code ends that person's old sessions at once.
- **A PIN already used by a colleague in the same role** is refused, and the code is used up. This limits anyone to one guess per code.
- **Login names are public** for waiters and the bar, because the prompt asks for name plus PIN. Anyone with the URL can see the names of staff who have a PIN.
- **Bot protection is not built yet.** With the limits above, a distributed attack could try about 9,600 PINs a day, so a 4-digit PIN is weak if the app is public. Longer PINs help.

## Changes to the original plan

See "Changes to the original build prompt" in `AGENTS.md`.

## Other choices

- **Vercel runs in Frankfurt** (`fra1`), next to the database.
- **Demo mode runs the real database code** on PGlite, so `npm run dev` needs no Docker or accounts.
- **Merging tables is always a deliberate action.** Moving onto an occupied table is refused, because a merge cannot be undone.
- **Any waiter can act on any table,** as in the old app.
- **Order limits:** 100 kg, 200 pieces, 100 lines, 4 sides per dish, 500-character note.

## Known issues

- **Every menu image has a small `moda.app` badge** in its corner, from the export. I did not crop it, in case it is tied to your Moda plan. Re-exporting without it would remove it.
- **Vercel's Hobby plan is for non-commercial use.** A restaurant POS needs Pro: a $20/month platform fee, which includes $20 of usage credit, plus any seat charges.
