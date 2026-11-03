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
| Order steps | Every station taps through all four: Novo, U pripremi, Gotovo, Izdato, as your prompt says. | The old app let the kitchen and bar skip Gotovo, which is one tap fewer per order. It is a small change if you prefer that. |
| Grill price | The grill must enter a price on every order at Gotovo. It is what the waiter owes the grill, as in the old app, and it never changes the guest's bill. | Your prompt only says "the grill enters a price". |
| Lamb weight | Only "Jagnjetina s ražnja" is weighed, and its real weight changes the guest's bill. "Teletina ispod sača" is also sold by kg but keeps the ordered quantity. | It affects what guests pay for veal. |
| Mistyped weight | The weight is entered once and cannot be edited. The screen asks for a second tap when it looks far off the ordered amount. Otherwise, void the line once voids exist. | 6,2 kg typed instead of 0,62 kg bills 310 KM instead of 31 KM. |
| Who gets the "order issued" alert | Both the waiter who placed the order and the one holding the bill. | They differ after a merge or when a colleague adds to a table. |
| Orders on a discounted bill | Refused until the discount is removed with the manager's PIN. The old app let later lines inherit the discount. | Stops a comp on one coffee making everything ordered after it free, but adding to a discounted bill takes the manager twice. |
| Who can void | Any waiter, any line on an open bill, even after it was issued, with one of the four reasons and no PIN. Every void is logged. A void covers the whole line. | As in the old app, but it is the easiest way to lose takings. Your prompt only asks for a PIN on discounts. |
| Voided free side | If a dish's free side is voided, a charged side on that dish stays charged. | Gulaš with free Pire and Riža for 4 KM still charges Riža. Void Riža and re-add it to fix it. |
| Fully voided order | The card stays on the station's screen, marked, until the station clears it with one tap. It does not block payment. | If it vanished at once, the kitchen might keep cooking. |
| Void after an order was issued | The station gets no alert, because the order has left its screen. | The food has already gone out. |
| Split by person | One payment, plus the shares for that number of people, adding up exactly with any leftover fenings on the first shares. Not separate payments per person. | As in the old app. Your prompt only says "allow splitting a bill by person". |
| Tip | Cash given, minus change returned, minus the total. The waiter must enter the change. On a card, whatever was charged above the total. | Tips are only right if the change is entered. |
| Discount rounding | Half up on what the guest pays, so 10,01 KM at 15 % is 8,51 KM. | Your accountant may have a rule. |
| Merging discounted bills | Refused until the manager removes the discount. | It would drop one discount or stretch the other. |
| Shift takings difference | Handed over, minus the bar's sales by count, minus kitchen and grill lines at menu price. Discounts, debts and card payments are not subtracted, so they show as a shortage, with those figures listed beside it. As in the old app. | A comp or a debt looks like missing cash. Tell me if these should be subtracted. |
| "Debt to the shop" | Built as what each waiter owes the grill, from the grill's price on each order. It grows when an order is issued, and only the grill records payments. As in the old app. | Your prompt says "debt to the shop", so please confirm this is what you meant. |
| Void after the grill priced an order | The waiter still owes the grill the full price. | The waiter carries the cost of a voided grill order. |
| Grill takings | Chickens sold x 14 KM plus lamb sold x 50 KM per kg, read from the menu and stored at closing. All lamb counts at the per-kg price, including portions. | Portions sell for a different amount than the per-kg price. |
| Butcher's selling prices | Your file has none, so butcher sales are refused until the manager sets a price per item. | Sales can't start until you enter them. |
| Purchase suggestions | The last 7 days of recipe use plus butcher sales, plus 20 %. Stock on hand is shown but not subtracted. Only 3 dishes have recipes, so most items suggest 0. | Needs real recipes to be useful. |
| Reservation names | Waiters see guests' names and phones on reservations, because they take the call and seat the guest. Debtor names go only to the manager. Names stay out of reports, CSV and the log. | It is personal data. |
| Business day | A calendar day in Sarajevo. Takings after midnight land on the next day, and the manager can close yesterday after midnight. | Late nights split across two days in reports. |
| Daily close | Refused while a bill or shift from that day is open. It stores the day's figures, and a payment landed later can be closed again, with both logged. | Check it matches how you close. |
| Who opens and closes shifts | Any waiter, as in the old app. The manager can do the grill count if nobody is at the grill. A closing count cannot be corrected once saved. | Counts drive the takings difference. |
| Opening a shift | About 70 drinks must each be typed at every opening. Carrying over the last closing count is not built. | Tell me after the trial week if this is too slow. |
| Kitchen staff role | Rebihić Aldina, Mirzeta and Nina log in as `kuhinja`. | The staff list marks this mapping "to be confirmed". |
| Printed receipts | Until the fiscal device is connected, each receipt says "Ovo nije fiskalni račun" and shows no VAT. | Do not hand these to guests as the official fiscal receipt. |

## What the app still needs from you

- **Fiscal device and receipt printer:** model and connection, plus any manual or API document.
- **Business details:** legal name, address, JIB, PDV number, and the VAT rates on food and drinks.
- **Design:** logo, colours, fonts and the design prompt.
- **Stock figures:** `stock-and-recipes.csv` says its quantities and purchase prices are demo values, and only 3 dishes have recipes. Real figures are needed before purchase suggestions can be trusted.
- **Menu translations:** the columns in `menu-export.csv` are empty. Nothing uses them until a language switch is built, which is a later feature.

## Security choices

- **Cache Components is off.** The strict browser security policy (CSP) needs each page rendered per request.
- **No public Supabase variables.** The browser never talks to the database, so it holds no key.
- **First PINs use a 6-digit code** that lasts 15 minutes and works once. The manager issues codes, and a new code ends that person's old sessions at once.
- **A PIN already used by a colleague in the same role** is refused, and the code is used up. This limits anyone to one guess per code.
- **Login names are public** for waiters and the bar, because the prompt asks for name plus PIN. Anyone with the URL can see the names of staff who have a PIN.
- **Guest names on debts are kept with no time limit for now.** They are stored only with the debt, and stay off the log and receipts. The retention rule comes in phase 7.
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
