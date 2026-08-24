import type { Product } from "./domain";

/* Parser for the bulk-add box: rows pasted from Excel/Sheets (tab-separated)
 * or a CSV file. Column order: title, barcode, sku, unit price, discount %.
 * Bad rows are reported by line number instead of failing the whole paste. */

export type NewProduct = Omit<Product, "id">;
export interface ParsedRow {
  line: number;
  product: NewProduct;
}
export interface ParseError {
  line: number;
  msg: string;
}
export interface ParseResult {
  rows: ParsedRow[];
  errors: ParseError[];
}

/** A first row that names the columns rather than holding data. */
const HEADERISH = /^(title|product|item|name|description)\b/i;

/** Split one CSV line, honouring "quoted, fields" — product titles contain commas. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } // "" is a literal quote
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Tab-separated when a tab is present (that is what a spreadsheet paste gives),
 * otherwise CSV. Deciding per line keeps mixed pastes working. */
function splitLine(line: string): string[] {
  return (line.includes("\t") ? line.split("\t") : splitCsv(line)).map((c) => c.trim());
}

/** Sheets export money as "E£ 1,299.00" — keep digits, dot and sign. */
function num(raw: string): number | null {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^\d.-]/g, "");
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function parseProducts(text: string): ParseResult {
  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];
  let seenData = false;

  (text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const cells = splitLine(raw);

    // Only the first non-empty row can be a header.
    if (!seenData && HEADERISH.test(cells[0] || "")) {
      seenData = true;
      return;
    }
    seenData = true;

    const [title, asin = "", sku = "", priceRaw = "", discRaw = ""] = cells;
    if (!title) {
      errors.push({ line, msg: "no product title" });
      return;
    }
    const unitPrice = num(priceRaw);
    if (unitPrice === null) {
      errors.push({ line, msg: `price "${priceRaw}" isn't a number` });
      return;
    }
    const discountPct = num(discRaw);
    if (discountPct === null) {
      errors.push({ line, msg: `discount "${discRaw}" isn't a number` });
      return;
    }
    if (discountPct < 0 || discountPct > 100) {
      errors.push({ line, msg: `discount ${discountPct}% is outside 0–100` });
      return;
    }
    if (unitPrice < 0) {
      errors.push({ line, msg: "price is negative" });
      return;
    }
    rows.push({ line, product: { title, asin, sku, unitPrice, discountPct } });
  });

  return { rows, errors };
}
