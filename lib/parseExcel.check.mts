/* Runnable check for the Excel upload path: `npm run check`. Builds a real
 * .xlsx in memory (round-tripping through exceljs, not a hand-written buffer)
 * and a real .csv, then feeds both through parseProductsFromFile exactly as
 * the browser upload does. */
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseProductsFromFile } from "./parseExcel.ts";

async function xlsxFile(rows: (string | number)[][]): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Products");
  rows.forEach((r) => sheet.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf as BlobPart], "products.xlsx");
}

// a header row (skipped), a good row, and a row with a bad price
const wbFile = await xlsxFile([
  ["Title", "Barcode", "SKU", "Price", "Disc"],
  ["Wireless Earbuds Pro", "B09ABC1234", "WEP-001", 79.99, 0],
  ["Bad Row", "B2", "S2", "not-a-price", 0],
]);
const wbResult = await parseProductsFromFile(wbFile);
assert.equal(wbResult.rows.length, 1);
assert.deepEqual(wbResult.rows[0].product, { title: "Wireless Earbuds Pro", asin: "B09ABC1234", sku: "WEP-001", unitPrice: 79.99, discountPct: 0 });
assert.equal(wbResult.errors.length, 1);
assert.match(wbResult.errors[0].msg, /isn't a number/);

// a blank row in the middle must not shift later row numbers
const withGap = await xlsxFile([
  ["A", "B1", "S1", 10, 0],
  [],
  ["C", "B2", "S2", 20, 0],
]);
const gapResult = await parseProductsFromFile(withGap);
assert.equal(gapResult.rows.length, 2);
assert.equal(gapResult.rows[1].line, 3);

// .csv files skip exceljs entirely and reuse the paste parser
const csvFile = new File(["Title,Barcode,SKU,Price,Disc\nLamp,B1,L1,39.5,10"], "products.csv");
const csvResult = await parseProductsFromFile(csvFile);
assert.equal(csvResult.rows.length, 1);
assert.equal(csvResult.rows[0].product.title, "Lamp");
assert.equal(csvResult.rows[0].product.discountPct, 10);

console.log("parseExcel: all checks passed");
