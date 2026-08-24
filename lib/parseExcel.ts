import type ExcelJS from "exceljs";
import type { ParseResult } from "./parseProducts.ts";
import { parseProductRows, parseProducts } from "./parseProducts.ts";

/* Reads the first sheet of an uploaded .xlsx/.xls/.csv file into product
 * rows, using the same validator the paste box uses (lib/parseProducts.ts) —
 * a spreadsheet with a bad price cell reports "Row 5" exactly like a bad
 * pasted line would. exceljs is loaded lazily so its parser isn't in the main
 * bundle for people who only ever paste. */

/** A cell can come back as a plain value, rich text runs, a formula result,
 * or a Date — flatten all of those to what the row validator expects. */
function flattenCell(v: ExcelJS.CellValue): string | number | boolean {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return flattenCell(v.result);
    if ("text" in v) return String((v as { text: unknown }).text);
    return ""; // hyperlink/error/shared-formula shapes with nothing usable
  }
  return v;
}

export async function parseProductsFromFile(file: File): Promise<ParseResult> {
  // .csv is plain text — the existing paste parser already handles it, no
  // need to route it through exceljs (which expects a Node stream for CSV).
  if (/\.csv$/i.test(file.name)) return parseProducts(await file.text());

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const sheet = wb.worksheets[0];
  const rows: (string | number | boolean)[][] = [];
  sheet?.eachRow({ includeEmpty: true }, (row) => {
    // row.values is 1-indexed (index 0 is always empty) — drop it to line up with column A.
    rows.push((row.values as ExcelJS.CellValue[]).slice(1).map(flattenCell));
  });

  return parseProductRows(rows);
}
