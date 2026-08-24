import type { Align, Block, ColField, Column, TableRow, TemplateDoc } from "./templateTypes.ts";
import { defaultDoc, makeBlock, uid } from "./templateTypes.ts";

/* Built-in starter templates: reused both for seeding a brand-new account's
 * demo data (see lib/seed.ts) and for the "start from a template" strip in
 * the Template Builder gallery, so both places show the same catalog. They
 * differ in more than color — Bold Header, Compact and Amazon Business
 * rearrange blocks and the product table's columns, not just the palette.
 * Amazon Business's column set (SKU + ASIN) and Marketplace Facilitator tax
 * note follow what Amazon Business / Seller Central invoices are expected to
 * carry — see the commit that introduced this template for the sourcing. */

export interface StarterTemplate {
  key: string;
  doc: TemplateDoc;
}

const base = () => defaultDoc();

function restyled(name: string, primary: string, accent: string, accentText: string): TemplateDoc {
  const doc = base();
  doc.name = name;
  doc.page = { ...doc.page, primary, accent, accentText };
  return doc;
}

/** A standalone logo above the header (instead of inline with it), and a
 * closing note after the totals. */
function boldHeaderDoc(): TemplateDoc {
  const doc = base();
  doc.name = "Bold Header";
  doc.page = { margin: 44, primary: "#0f172a", accent: "#facc15", accentText: "#713f12", font: "Space Grotesk" };
  const header = doc.blocks.find((b) => b.type === "header")!;
  header.props.showLogo = false;
  const logo = makeBlock("logo");
  logo.props.size = 60;
  doc.blocks.unshift(logo);
  const divider = makeBlock("divider");
  const textIdx = doc.blocks.findIndex((b) => b.type === "text");
  doc.blocks.splice(textIdx, 0, divider);
  return doc;
}

function productTable(defs: { label: string; field: ColField; align: Align; flex: number; sample: string }[]): Block {
  const cols: Column[] = defs.map((d) => ({ id: uid("c"), label: d.label, align: d.align, flex: d.flex, field: d.field }));
  const row = (): TableRow => ({ id: uid("r"), cells: Object.fromEntries(cols.map((c, i) => [c.id, defs[i].sample])) });
  return { id: uid(), type: "productTable", props: { columns: cols, rows: [row(), row(), row()] } };
}

/** A shorter product table (item / qty / rate / amount — no row number or
 * barcode column) and a shorter totals block, for one-page short invoices. */
function compactDoc(): TemplateDoc {
  const doc = base();
  doc.name = "Compact";
  doc.page = { margin: 28, primary: "#111111", accent: "#e5e5e5", accentText: "#111111", font: "Manrope" };
  doc.blocks.find((b) => b.type === "header")!.props.title = "INVOICE";

  const tableIdx = doc.blocks.findIndex((b) => b.type === "productTable");
  doc.blocks[tableIdx] = productTable([
    { label: "Item", field: "description", align: "left", flex: 3, sample: "Wireless Earbuds Pro" },
    { label: "Qty", field: "qty", align: "right", flex: 0.7, sample: "2" },
    { label: "Rate", field: "rate", align: "right", flex: 1, sample: "E£ 100.00" },
    { label: "Amount", field: "amount", align: "right", flex: 1, sample: "E£ 230.00" },
  ]);

  const totalsIdx = doc.blocks.findIndex((b) => b.type === "totals");
  const totals: Block = {
    id: uid(),
    type: "totals",
    props: {
      rows: [
        { label: "Sub Total", value: "{{subtotal}}" },
        { label: "Total", value: "{{total}}", strong: true },
      ],
      showBalance: true,
      balanceLabel: "Due",
      balanceValue: "{{balance}}",
    },
  };
  doc.blocks[totalsIdx] = totals;

  doc.blocks.find((b) => b.type === "text")!.props.text = "Thanks for your business!";
  return doc;
}

/** Matches the field set Amazon Business / Seller Central expect on a seller's
 * invoice: SKU alongside the barcode/ASIN, and a note on marketplace-collected
 * tax (see the research note below the catalog). */
function amazonBusinessDoc(): TemplateDoc {
  const doc = base();
  doc.name = "Amazon Business";
  doc.page = { margin: 44, primary: "#131921", accent: "#ff9900", accentText: "#3d1f00", font: "Manrope" };

  const tableIdx = doc.blocks.findIndex((b) => b.type === "productTable");
  doc.blocks[tableIdx] = productTable([
    { label: "#", field: "index", align: "left", flex: 0.4, sample: "1" },
    { label: "Item & Description", field: "description", align: "left", flex: 2.4, sample: "Wireless Earbuds Pro" },
    { label: "SKU", field: "sku", align: "left", flex: 0.9, sample: "WEP-001" },
    { label: "ASIN", field: "asin", align: "left", flex: 1, sample: "B09ABC1234" },
    { label: "Qty", field: "qty", align: "right", flex: 0.5, sample: "2" },
    { label: "Rate", field: "rate", align: "right", flex: 0.9, sample: "E£ 100.00" },
    { label: "Amount", field: "amount", align: "right", flex: 1, sample: "E£ 230.00" },
  ]);

  const divider = makeBlock("divider");
  const textIdx = doc.blocks.findIndex((b) => b.type === "text");
  doc.blocks.splice(textIdx, 0, divider);
  doc.blocks.find((b) => b.type === "text")!.props.text =
    "Where applicable, sales tax on this order was collected and remitted by Amazon as Marketplace Facilitator.";

  return doc;
}

export function starterTemplates(): StarterTemplate[] {
  return [
    { key: "classic", doc: restyled("Classic (dark table)", "#1f2937", "#fde68a", "#7a5a00") },
    { key: "corporate", doc: restyled("Corporate (blue)", "#2563eb", "#dbe7ff", "#1e3a8a") },
    { key: "minimal", doc: restyled("Minimal (accent)", "#111111", "#f7e733", "#5a5300") },
    { key: "bold-header", doc: boldHeaderDoc() },
    { key: "compact", doc: compactDoc() },
    { key: "amazon-business", doc: amazonBusinessDoc() },
  ];
}
