import { compTotals } from "./calc";
import { Customer, genId, Invoice, InvoiceLine, Product, Supplier } from "./domain";
import { defaultDoc, TemplateDoc, TemplateRecord } from "./templateTypes";
import { saveEntity } from "./entitiesApi";
import { insertInvoices } from "./invoicesApi";
import { listTemplates, saveTemplate, setPublished } from "./templatesApi";

/* Per-user demo seeding: creates fresh companies/customers/products (with unique
 * ids), three starter templates and nine sample invoices, all owned by the caller. */

export function defaultTemplates(): TemplateDoc[] {
  const base = defaultDoc();
  const mk = (name: string, primary: string, accent: string, accentText: string): TemplateDoc => ({
    ...JSON.parse(JSON.stringify(base)),
    name,
    page: { margin: 44, primary, accent, accentText, font: "Manrope" },
  });
  return [
    mk("Classic (dark table)", "#1f2937", "#fde68a", "#7a5a00"),
    mk("Corporate (blue)", "#2563eb", "#dbe7ff", "#1e3a8a"),
    mk("Minimal (accent)", "#111111", "#f7e733", "#5a5300"),
  ];
}

const DEMO_SUPPLIERS: Omit<Supplier, "id">[] = [
  { name: "Zylker Dezigns", legal: "Zylker Dezigns LLC", taxId: "TRN 3001234567890", email: "billing@zylker.com", phone: "+966 55 000 1234", addr: "P.O. Box 8223, Tahlia Street, Jeddah, KSA", website: "www.zylkerdezigns.com", logoText: "ZD" },
  { name: "Saldo Apps", legal: "Saldo Apps Inc.", taxId: "EIN 88-1234567", email: "wiz@saldoapps.com", phone: "+1 802 969 7959", addr: "First str. 28-32, Chicago, IL, USA", website: "www.saldoapps.com", logoText: "SA" },
  { name: "ZapBuy Trading", legal: "ZapBuy Trading Co.", taxId: "EIN 47-7654321", email: "support@zapbuy.com", phone: "+1 654 123 123", addr: "3647 Confederate Drive, Syracuse, NY", website: "www.zapbuy.com", logoText: "ZB" },
];
const DEMO_CUSTOMERS: Omit<Customer, "id">[] = [
  { store: "Shepard Corp", contact: "Shepard Corp.", email: "shepard@mail.com", phone: "+1 802 969 7959", billing: "North str. 32, Chicago, IL, USA", shipping: "North str. 32, Chicago, IL, USA", track: "RO80296979597" },
  { store: "Miqdaad Traders", contact: "Miqdaad ah Shah", email: "miqdaad@mail.com", phone: "+966 55 111 2222", billing: "P.O Box 56908, Sulaimaniyah Dist., Riyadh", shipping: "P.O Box 56908, Sulaimaniyah Dist., Riyadh", track: "RO12045008" },
  { store: "Yesenia Retail", contact: "Yesenia M. Lawrence", email: "yesenia@youraddress.com", phone: "+1 555 987 123", billing: "3647 Confederate Drive, Syracuse, NY 13221", shipping: "3647 Confederate Drive, Syracuse, NY 13221", track: "RO99887766" },
];
const DEMO_PRODUCTS: Omit<Product, "id">[] = [
  { title: "Wireless Earbuds Pro", asin: "B09ABC1234", sku: "WEP-001", unitPrice: 79.99, discountPct: 0 },
  { title: "4K Action Camera", asin: "B08DEF5678", sku: "ACM-4K", unitPrice: 129.0, discountPct: 5 },
  { title: "Stainless Steel Water Bottle", asin: "B07GHI9012", sku: "SWB-32", unitPrice: 24.5, discountPct: 0 },
  { title: "LED Desk Lamp", asin: "B08JKL3456", sku: "LDL-10", unitPrice: 39.99, discountPct: 10 },
  { title: "Bluetooth Speaker Mini", asin: "B09MNO7890", sku: "BSM-05", unitPrice: 45.0, discountPct: 0 },
  { title: "ToasterMaster Toaster", asin: "B07TST0432", sku: "BHT432", unitPrice: 50.0, discountPct: 2 },
  { title: "QuickHeat Pro Microwave", asin: "B08MWA0789", sku: "A789", unitPrice: 150.0, discountPct: 10 },
];
// [number, status, date, dueDate, amountPaid, supplierIdx, customerIdx, templateIdx, lines:[[productIdx, qty]]]
const DEMO_INVOICES: Array<{ number: string; status: Invoice["status"]; date: string; dueDate: string; paid: number; s: number; c: number; t: number; lines: [number, number][] }> = [
  { number: "INV-001654", status: "Paid", date: "08 Dec 2025", dueDate: "22 Dec 2025", paid: 2760, s: 0, c: 1, t: 0, lines: [[5, 4], [6, 3]] },
  { number: "INV-001702", status: "Paid", date: "14 Jan 2026", dueDate: "13 Feb 2026", paid: 8480, s: 1, c: 0, t: 1, lines: [[0, 20], [1, 12]] },
  { number: "INV-001745", status: "Pending", date: "03 Feb 2026", dueDate: "17 Feb 2026", paid: 0, s: 2, c: 2, t: 2, lines: [[5, 1], [6, 1]] },
  { number: "INV-001788", status: "Paid", date: "21 Feb 2026", dueDate: "07 Mar 2026", paid: 3200, s: 1, c: 0, t: 1, lines: [[3, 40], [4, 20]] },
  { number: "INV-001820", status: "Overdue", date: "11 Mar 2026", dueDate: "25 Mar 2026", paid: 0, s: 0, c: 1, t: 0, lines: [[2, 60], [4, 30]] },
  { number: "INV-001866", status: "Paid", date: "29 Mar 2026", dueDate: "12 Apr 2026", paid: 5400, s: 2, c: 2, t: 2, lines: [[0, 40], [3, 24]] },
  { number: "INV-001901", status: "Pending", date: "18 Apr 2026", dueDate: "02 May 2026", paid: 0, s: 1, c: 0, t: 1, lines: [[1, 30], [0, 18]] },
  { number: "INV-001945", status: "Paid", date: "09 May 2026", dueDate: "23 May 2026", paid: 4100, s: 0, c: 1, t: 0, lines: [[6, 20], [5, 15]] },
  { number: "INV-001988", status: "Pending", date: "02 Jun 2026", dueDate: "16 Jun 2026", paid: 0, s: 2, c: 2, t: 2, lines: [[2, 80], [3, 30]] },
];

function buildDemoInvoices(sups: Supplier[], cuss: Customer[], prds: Product[], tpls: TemplateRecord[]): Invoice[] {
  return DEMO_INVOICES.map((d) => {
    const supplier = sups[d.s];
    const customer = cuss[d.c];
    const tpl = tpls[d.t % tpls.length];
    const lines: InvoiceLine[] = d.lines.map(([pi, qty]) => {
      const p = prds[pi];
      return { productId: p.id, description: p.title, asin: p.asin, qty, unitPrice: p.unitPrice, discountPct: p.discountPct };
    });
    const inv: Invoice = {
      id: genId("i"),
      number: d.number,
      status: d.status,
      currency: "EGP",
      date: d.date,
      dueDate: d.dueDate,
      supplierId: supplier.id,
      customerId: customer.id,
      templateId: tpl?.id ?? null,
      templateName: tpl?.name ?? "",
      supplier,
      customer,
      template: tpl ? tpl.doc : null,
      lines,
      amountPaid: d.paid,
      total: compTotals(lines, d.paid).total,
    };
    return inv;
  });
}

// Guard so concurrent mounts (React StrictMode double-invokes componentDidMount,
// auth events, etc.) can't seed the dataset twice.
let seedInFlight: Promise<void> | null = null;
export function seedDemoOnce(): Promise<void> {
  if (!seedInFlight) {
    // Dedupe concurrent callers; reset once done so a different user (after a
    // sign-out/sign-in) with an empty dataset can still seed later.
    seedInFlight = seedDemo().then(
      () => { seedInFlight = null; },
      (e) => { seedInFlight = null; throw e; },
    );
  }
  return seedInFlight;
}

/** Create a full demo dataset owned by the current user. */
export async function seedDemo(): Promise<void> {
  const sups: Supplier[] = [];
  for (const s of DEMO_SUPPLIERS) sups.push(await saveEntity<Supplier>("suppliers", { ...s, id: genId("s") } as Supplier));
  const cuss: Customer[] = [];
  for (const c of DEMO_CUSTOMERS) cuss.push(await saveEntity<Customer>("customers", { ...c, id: genId("c") } as Customer));
  const prds: Product[] = [];
  for (const p of DEMO_PRODUCTS) prds.push(await saveEntity<Product>("products", { ...p, id: genId("p") } as Product));

  const existing = await listTemplates();
  let tpls = existing;
  if (existing.length === 0) {
    tpls = [];
    for (const doc of defaultTemplates()) {
      const rec = await saveTemplate(doc.name, doc);
      await setPublished(rec.id, true);
      tpls.push({ ...rec, doc });
    }
  }
  await insertInvoices(buildDemoInvoices(sups, cuss, prds, tpls));
}
