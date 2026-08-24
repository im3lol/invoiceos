/* Runnable check for the built-in template catalog: `npm run check`. */
import assert from "node:assert/strict";
import { starterTemplates } from "./starterTemplates.ts";

const list = starterTemplates();
assert.equal(list.length, 5);

// keys and names are both unique — the gallery strip matches on name, ids on key
assert.equal(new Set(list.map((t) => t.key)).size, 5);
assert.equal(new Set(list.map((t) => t.doc.name)).size, 5);

// every template still carries the blocks that reach a real invoice
for (const { key, doc } of list) {
  const types = doc.blocks.map((b) => b.type);
  assert.ok(types.includes("header"), key + " missing header");
  assert.ok(types.includes("addressPair"), key + " missing addressPair");
  assert.ok(types.includes("productTable"), key + " missing productTable");
  assert.ok(types.includes("totals"), key + " missing totals");
}

// Bold Header: a standalone logo up front, and the header's own logo turned off
const bold = list.find((t) => t.key === "bold-header")!.doc;
assert.equal(bold.blocks[0].type, "logo");
const boldHeader = bold.blocks.find((b) => b.type === "header")!;
assert.equal(boldHeader.props.showLogo, false);

// Compact: a shorter product table and totals block than the others
const compact = list.find((t) => t.key === "compact")!.doc;
const compactTable = compact.blocks.find((b) => b.type === "productTable")!;
assert.equal((compactTable.props.columns as unknown[]).length, 4);
const classicTable = list.find((t) => t.key === "classic")!.doc.blocks.find((b) => b.type === "productTable")!;
assert.equal((classicTable.props.columns as unknown[]).length, 7);
const compactTotals = compact.blocks.find((b) => b.type === "totals")!;
assert.equal((compactTotals.props.rows as unknown[]).length, 2);

// every totals block opts into live numbers via tokens, not printed samples
for (const { key, doc } of list) {
  const totals = doc.blocks.find((b) => b.type === "totals")!;
  const rows = totals.props.rows as { value: string }[];
  assert.ok(rows.some((r) => /\{\{\w+\}\}/.test(r.value)), key + " totals has no token");
}

console.log("starterTemplates: all checks passed");
