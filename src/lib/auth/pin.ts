import { z } from "zod";

// Format only. Weak PINs are refused by pin_je_slab in SQL.
export const pinShema = z.string().regex(/^[0-9]{4,8}$/);
export const kodShema = z.string().regex(/^[0-9]{6}$/);
