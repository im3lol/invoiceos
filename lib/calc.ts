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
  const net = price * qty;
  const dAmt = (net * disc) / 100;
  return { net, dAmt, total: net - dAmt };
}

/** Tax config for an invoice: a single rate (from the company) that can be off. */
export interface TaxCfg {
  enabled: boolean;
  rate: number;
}
/** Read the tax config off anything that carries taxEnabled/taxRate (company or invoice). */
export function taxOf(x: { taxEnabled?: boolean; taxRate?: number }): TaxCfg {
  return { enabled: !!x.taxEnabled, rate: +(x.taxRate ?? 0) || 0 };
}

export function compTotals(lines: InvoiceLine[], amountPaid = 0, tax?: TaxCfg) {
  let subtotal = 0,
    discount = 0;
  (lines || []).forEach((l) => {
    const c = compLine(l);
    subtotal += c.net;
    discount += c.dAmt;
  });
  const taxable = subtotal - discount;
  const taxRate = tax?.enabled ? +tax.rate || 0 : 0;
  const taxTotal = (taxable * taxRate) / 100;
  const total = taxable + taxTotal;
  const paid = +amountPaid || 0;
  return { subtotal, discount, taxRate, taxTotal, total, paid, balance: total - paid };
}
