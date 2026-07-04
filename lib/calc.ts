import type { InvoiceLine } from "./domain";

/* Money + line/total math — single source of truth used by the class app,
 * the invoice wizard and the renderer. */

const SYMBOLS: Record<string, string> = { EGP: "E£ ", USD: "$", EUR: "€", SAR: "SAR " };

export function money(n: number, currency: string): string {
  const sym = SYMBOLS[currency] || currency + " ";
  return sym + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Currency options for dropdowns — EGP first (the default). */
export const CURRENCIES: { value: string; label: string }[] = [
  { value: "EGP", label: "EGP E£" },
  { value: "USD", label: "USD $" },
  { value: "SAR", label: "SAR" },
  { value: "EUR", label: "EUR €" },
];

export function compLine(l: InvoiceLine) {
  const price = +l.unitPrice || 0;
  const qty = +l.qty || 0;
  const disc = +l.discountPct || 0;
  const tax = +l.taxPct || 0;
  const net = price * qty;
  const dAmt = (net * disc) / 100;
  const taxable = net - dAmt;
  const tAmt = (taxable * tax) / 100;
  return { net, dAmt, taxable, tAmt, total: taxable + tAmt };
}

export function compTotals(lines: InvoiceLine[], amountPaid = 0) {
  let subtotal = 0,
    discount = 0,
    taxTotal = 0;
  (lines || []).forEach((l) => {
    const c = compLine(l);
    subtotal += c.net;
    discount += c.dAmt;
    taxTotal += c.tAmt;
  });
  const total = subtotal - discount + taxTotal;
  const paid = +amountPaid || 0;
  return { subtotal, discount, taxTotal, total, paid, balance: total - paid };
}
