/* ------------------------------------------------------------------ *
 * Template document model for the WYSIWYG Template Builder.
 * A template is an ordered list of blocks rendered onto an A4 page.
 * ------------------------------------------------------------------ */

let _uid = 0;
export function uid(prefix = "b"): string {
  _uid += 1;
  return prefix + "_" + Date.now().toString(36) + "_" + _uid + Math.floor(Math.random() * 1e4).toString(36);
}

export type Align = "left" | "center" | "right";

export type BlockType =
  | "header"
  | "addressPair"
  | "productTable"
  | "totals"
  | "logo"
  | "heading"
  | "text"
  | "divider"
  | "spacer";

/** Which invoice-line field a product-table column shows. "custom" = a free
 * per-line value entered on the invoice. */
export type ColField = "index" | "description" | "asin" | "qty" | "rate" | "discount" | "amount" | "custom";

export const COL_FIELDS: { value: ColField; label: string }[] = [
  { value: "index", label: "# (row no.)" },
  { value: "description", label: "Item / Description" },
  { value: "asin", label: "Barcode / UPC" },
  { value: "qty", label: "Qty" },
  { value: "rate", label: "Unit Price" },
  { value: "discount", label: "Discount %" },
  { value: "amount", label: "Line Amount" },
  { value: "custom", label: "Custom (free text)" },
];

export interface Column {
  id: string;
  label: string;
  align: Align;
  flex: number; // relative width
  field?: ColField; // binding to invoice data (undefined = custom/free)
  hidden?: boolean; // hidden columns are skipped when rendering the invoice
}
export interface TableRow {
  id: string;
  cells: Record<string, string>; // columnId -> value
}

export interface MetaRow {
  label: string;
  value: string;
}
export interface TotalRow {
  label: string;
  value: string;
  strong?: boolean;
}

export interface Block {
  id: string;
  type: BlockType;
  // Prop bag differs per type; kept loose on purpose.
  props: Record<string, unknown>;
}

export interface PageStyle {
  margin: number;
  primary: string;
  accent: string;
  font: string;
  accentText: string;
}

export interface TemplateDoc {
  name: string;
  page: PageStyle;
  blocks: Block[];
}

export interface TemplateRecord {
  id: string;
  name: string;
  doc: TemplateDoc;
  published: boolean;
  updated_at?: string;
}

export const FONTS = ["Manrope", "Space Grotesk", "Georgia"];

export function fontFamily(f: string): string {
  return f === "Georgia" ? "Georgia, serif" : "'" + f + "', sans-serif";
}

/* ---------- block factory ---------- */
export function makeBlock(type: BlockType): Block {
  const id = uid();
  switch (type) {
    case "header":
      return {
        id,
        type,
        props: {
          title: "TAX INVOICE",
          supplierName: "Zylker Dezigns",
          supplierLines: "P.O Box 8223, Tahlia Street\nJeddah, KSA\nTRN 3001234567890",
          showLogo: true,
          logoText: "ZD",
          metaRows: [
            { label: "Invoice #", value: "INV-001654" },
            { label: "Date", value: "08 Dec 2025" },
            { label: "Due Date", value: "22 Dec 2025" },
          ] as MetaRow[],
        },
      };
    case "addressPair":
      return {
        id,
        type,
        props: {
          leftLabel: "Bill To",
          leftName: "Miqdaad Traders",
          leftLines: "P.O Box 56908, Sulaimaniyah Dist.\nRiyadh, KSA\n+966 55 111 2222",
          rightLabel: "Ship To",
          rightName: "Miqdaad Traders",
          rightLines: "P.O Box 56908, Sulaimaniyah Dist.\nRiyadh, KSA\nTrack #: RO12045008",
        },
      };
    case "productTable": {
      const std: Array<{ label: string; field: ColField; align: Align; flex: number; sample: string }> = [
        { label: "#", field: "index", align: "left", flex: 0.4, sample: "1" },
        { label: "Item & Description", field: "description", align: "left", flex: 2.6, sample: "Wireless Earbuds Pro" },
        { label: "Barcode", field: "asin", align: "left", flex: 1, sample: "0123456789012" },
        { label: "Qty", field: "qty", align: "right", flex: 0.6, sample: "2" },
        { label: "Rate", field: "rate", align: "right", flex: 0.9, sample: "E£ 100.00" },
        { label: "Disc", field: "discount", align: "right", flex: 0.6, sample: "0%" },
        { label: "Amount", field: "amount", align: "right", flex: 1, sample: "E£ 230.00" },
      ];
      const cols: Column[] = std.map((c) => ({ id: uid("c"), label: c.label, align: c.align, flex: c.flex, field: c.field }));
      const mkRow = (): TableRow => ({ id: uid("r"), cells: Object.fromEntries(cols.map((c, i) => [c.id, std[i].sample])) });
      return { id, type, props: { columns: cols, rows: [mkRow(), mkRow(), mkRow()] as TableRow[] } };
    }
    case "totals":
      return {
        id,
        type,
        props: {
          rows: [
            { label: "Sub Total", value: "2760.00" },
            { label: "Total", value: "2760.00", strong: true },
          ] as TotalRow[],
          showBalance: true,
          balanceLabel: "Balance Due",
          balanceValue: "SAR 2760.00",
        },
      };
    case "logo":
      return { id, type, props: { logoText: "ZD", size: 54 } };
    case "heading":
      return { id, type, props: { text: "Section Heading", size: 18, align: "left", color: "#1e2433" } };
    case "text":
      return { id, type, props: { text: "Thank you for your business.", size: 12, align: "left", color: "#5b6478" } };
    case "divider":
      return { id, type, props: { color: "#e8ecf3" } };
    case "spacer":
      return { id, type, props: { height: 24 } };
    default:
      return { id, type, props: {} };
  }
}

export function defaultDoc(): TemplateDoc {
  return {
    name: "Untitled Template",
    page: { margin: 44, primary: "#1f2937", accent: "#fde68a", accentText: "#7a5a00", font: "Manrope" },
    blocks: [makeBlock("header"), makeBlock("addressPair"), makeBlock("productTable"), makeBlock("totals"), makeBlock("text")],
  };
}

export const PALETTE: { type: BlockType; label: string; icon: string; desc: string }[] = [
  { type: "header", label: "Header Block", icon: "H", desc: "Logo, title & invoice no." },
  { type: "addressPair", label: "Billing/Shipping Pair", icon: "A", desc: "Two address columns" },
  { type: "productTable", label: "Product Table", icon: "T", desc: "Editable rows & columns" },
  { type: "totals", label: "Totals Summary", icon: "Σ", desc: "Subtotal, discount, balance" },
  { type: "logo", label: "Logo Upload", icon: "◈", desc: "Standalone brand mark" },
  { type: "heading", label: "Heading Text", icon: "Aa", desc: "Large section title" },
  { type: "text", label: "Text Box", icon: "T", desc: "Paragraph / notes" },
  { type: "divider", label: "Divider", icon: "—", desc: "Horizontal rule" },
  { type: "spacer", label: "Spacer", icon: "↕", desc: "Vertical gap" },
];
