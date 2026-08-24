/* Runnable check for the bulk-add parser: `npm run check`. */
import assert from "node:assert/strict";
import { parseProducts } from "./parseProducts.ts";

// a spreadsheet paste (tabs), with a header row that must be dropped
const tsv = parseProducts(
  ["Title\tBarcode\tSKU\tPrice\tDisc", "Earbuds Pro\tB09ABC1234\tWEP-001\t79.99\t0", "Desk Lamp\tB08JKL3456\tLDL-10\t39.99\t10"].join("\n"),
);
assert.equal(tsv.errors.length, 0);
assert.equal(tsv.rows.length, 2);
assert.deepEqual(tsv.rows[0].product, { title: "Earbuds Pro", asin: "B09ABC1234", sku: "WEP-001", unitPrice: 79.99, discountPct: 0 });
assert.equal(tsv.rows[1].product.discountPct, 10);

// CSV with a comma inside a quoted title
const csv = parseProducts('"Lamp, LED, 10W",B1,LDL,39.5,5');
assert.equal(csv.errors.length, 0);
assert.equal(csv.rows[0].product.title, "Lamp, LED, 10W");
assert.equal(csv.rows[0].product.unitPrice, 39.5);

// formatted money and thousands separators survive
assert.equal(parseProducts("Microwave,B2,MW,\"E£ 1,299.00\",0").rows[0].product.unitPrice, 1299);

// blank lines skipped; missing trailing columns default to empty/zero
const sparse = parseProducts("\nOnly A Title\n\n");
assert.equal(sparse.rows.length, 1);
assert.deepEqual(sparse.rows[0].product, { title: "Only A Title", asin: "", sku: "", unitPrice: 0, discountPct: 0 });

// bad rows are reported by line number, good rows still import
const mixed = parseProducts(["Good One\tB1\tS1\t10\t0", "\tB2\tS2\t10\t0", "Bad Price\tB3\tS3\tabc\t0", "Bad Disc\tB4\tS4\t10\t150"].join("\n"));
assert.equal(mixed.rows.length, 1);
assert.equal(mixed.rows[0].product.title, "Good One");
assert.deepEqual(mixed.errors.map((e) => e.line), [2, 3, 4]);
assert.match(mixed.errors[0].msg, /no product title/);
assert.match(mixed.errors[1].msg, /isn't a number/);
assert.match(mixed.errors[2].msg, /outside 0–100/);

// a header-looking word further down is data, not a header
const late = parseProducts("Real Item\tB1\tS1\t5\t0\nTitle Holder Bracket\tB2\tS2\t7\t0");
assert.equal(late.rows.length, 2);

assert.equal(parseProducts("").rows.length, 0);

console.log("parseProducts: all checks passed");
