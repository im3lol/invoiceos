/* Runnable check for the money math: `node lib/calc.check.ts` (or `npm run check`).
 * Money fields arrive as raw input strings while the user types, so every
 * assertion below feeds strings as well as numbers. */
import assert from "node:assert/strict";
import { compLine, compTotals, money, taxOf } from "./calc.ts";
import type { InvoiceLine } from "./domain.ts";

const line = (qty: number | string, unitPrice: number | string, discountPct: number | string): InvoiceLine => ({
  productId: "p1",
  description: "Item",
  asin: "—",
  qty,
  unitPrice,
  discountPct,
});

// formatting
assert.equal(money(1234.5), "E£ 1,234.50");
assert.equal(money(0), "E£ 0.00");
assert.equal(money(NaN), "E£ 0.00");

// a line: net minus its own discount, from strings too
assert.deepEqual(compLine(line(2, 100, 10)), { net: 200, dAmt: 20, total: 180 });
assert.deepEqual(compLine(line("2", "100", "10")), { net: 200, dAmt: 20, total: 180 });
assert.equal(compLine(line("", "", "")).total, 0);

// tax config: off means no tax whatever the rate says
assert.deepEqual(taxOf({ taxEnabled: true, taxRate: "14" }), { enabled: true, rate: 14 });
assert.deepEqual(taxOf({}), { enabled: false, rate: 0 });
assert.equal(compTotals([line(1, 100, 0)], 0, taxOf({ taxEnabled: false, taxRate: 14 })).total, 100);

// the whole invoice: subtotal → discount → tax → balance
const t = compTotals([line(2, 100, 10), line(1, 50, 0)], "12.5", taxOf({ taxEnabled: true, taxRate: "14" }));
assert.equal(t.subtotal, 250);
assert.equal(t.discount, 20);
assert.equal(t.taxTotal, 32.2); // (250 - 20) * 14%
assert.equal(t.total, 262.2);
assert.equal(t.paid, 12.5); // the decimal survives as a string — was rounded to 12 before
assert.equal(t.balance, 249.7);

// half-typed input must not blow up the totals
assert.equal(compTotals([line(1, 100, 0)], "12.", taxOf({ taxEnabled: true, taxRate: "" })).total, 100);

console.log("calc: all checks passed");
