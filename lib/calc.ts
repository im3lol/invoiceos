import type { InvoiceLine } from "./domain";

/* Money + line/total math — single source of truth used by the class app,
 * the invoice wizard and the renderer. */

/** Single currency for now: the Egyptian pound. Invoices still record it so a
 * future multi-currency change has one obvious hook.
 * ponytail: one currency, no conversion. Add a rate table only if a second one lands. */
export const CURRENCY = "EGP";

export function money(n: number): string {
  return "E£ " + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
/** Read the tax config off anything that carries taxEnabled/taxRate (company or
 * invoice). Rates arrive as raw input strings while being typed, hence the `+`. */
export function taxOf(x: { taxEnabled?: boolean; taxRate?: number | string }): TaxCfg {
  return { enabled: !!x.taxEnabled, rate: +(x.taxRate ?? 0) || 0 };
}

export function compTotals(lines: InvoiceLine[], amountPaid: number | string = 0, tax?: TaxCfg) {
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
