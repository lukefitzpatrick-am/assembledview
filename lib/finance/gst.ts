import { roundMoney2 } from "@/lib/format/money"

/** Australian GST rate (10%). */
export const GST_RATE = 0.1

/** Round money to 2 decimal places. Re-exports the shared currency helper. */
export const round2 = roundMoney2

/** Convert an ex-GST amount to inc-GST. */
export const addGst = (exGst: number) => round2(exGst * (1 + GST_RATE))

/** GST component of an ex-GST amount. */
export const gstAmount = (exGst: number) => round2(exGst * GST_RATE)
