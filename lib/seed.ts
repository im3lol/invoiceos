import { compTotals } from "./calc";
import type { Customer, Invoice, InvoiceLine, Product, Supplier } from "./domain";
import { defaultDoc, TemplateDoc, TemplateRecord } from "./templateTypes";

/* One-time demo seeding: three starter templates + nine sample invoices. */

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

export function demoInvoices(suppliers: Supplier[], customers: Customer[], products: Product[], templates: TemplateRecord[]): Invoice[] {
  const S = (id: string) => suppliers.find((x) => x.id === id) || suppliers[0];
  const C = (id: string) => customers.find((x) => x.id === id) || customers[0];
  const L = (pid: string, qty: number): InvoiceLine => {
    const p = products.find((x) => x.id === pid) || products[0];
    return { productId: p.id, description: p.title, asin: p.asin, qty, unitPrice: p.unitPrice, discountPct: p.discountPct, taxPct: p.taxPct };
  };
  const T = (i: number) => templates[i % templates.length];

  const defs: Array<Omit<Invoice, "supplier" | "customer" | "template" | "templateId" | "templateName" | "total" | "currency"> & { s: string; c: string; ti: number }> = [
    { id: "i1", number: "INV-001654", status: "Paid", date: "08 Dec 2025", dueDate: "22 Dec 2025", supplierId: "s1", customerId: "c2", amountPaid: 2760, lines: [L("p6", 4), L("p7", 3)], s: "s1", c: "c2", ti: 0 },
    { id: "i2", number: "INV-001702", status: "Paid", date: "14 Jan 2026", dueDate: "13 Feb 2026", supplierId: "s2", customerId: "c1", amountPaid: 8480, lines: [L("p1", 20), L("p2", 12)], s: "s2", c: "c1", ti: 1 },
    { id: "i3", number: "INV-001745", status: "Pending", date: "03 Feb 2026", dueDate: "17 Feb 2026", supplierId: "s3", customerId: "c3", amountPaid: 0, lines: [L("p6", 1), L("p7", 1)], s: "s3", c: "c3", ti: 2 },
    { id: "i4", number: "INV-001788", status: "Paid", date: "21 Feb 2026", dueDate: "07 Mar 2026", supplierId: "s2", customerId: "c1", amountPaid: 3200, lines: [L("p4", 40), L("p5", 20)], s: "s2", c: "c1", ti: 1 },
    { id: "i5", number: "INV-001820", status: "Overdue", date: "11 Mar 2026", dueDate: "25 Mar 2026", supplierId: "s1", customerId: "c2", amountPaid: 0, lines: [L("p3", 60), L("p5", 30)], s: "s1", c: "c2", ti: 0 },
    { id: "i6", number: "INV-001866", status: "Paid", date: "29 Mar 2026", dueDate: "12 Apr 2026", supplierId: "s3", customerId: "c3", amountPaid: 5400, lines: [L("p1", 40), L("p4", 24)], s: "s3", c: "c3", ti: 2 },
    { id: "i7", number: "INV-001901", status: "Pending", date: "18 Apr 2026", dueDate: "02 May 2026", supplierId: "s2", customerId: "c1", amountPaid: 0, lines: [L("p2", 30), L("p1", 18)], s: "s2", c: "c1", ti: 1 },
    { id: "i8", number: "INV-001945", status: "Paid", date: "09 May 2026", dueDate: "23 May 2026", supplierId: "s1", customerId: "c2", amountPaid: 4100, lines: [L("p7", 20), L("p6", 15)], s: "s1", c: "c2", ti: 0 },
    { id: "i9", number: "INV-001988", status: "Pending", date: "02 Jun 2026", dueDate: "16 Jun 2026", supplierId: "s3", customerId: "c3", amountPaid: 0, lines: [L("p3", 80), L("p4", 30)], s: "s3", c: "c3", ti: 2 },
  ];

  return defs.map((d) => {
    const tpl = T(d.ti);
    const inv: Invoice = {
      id: d.id,
      number: d.number,
      status: d.status,
      currency: "EGP",
      date: d.date,
      dueDate: d.dueDate,
      supplierId: d.supplierId,
      customerId: d.customerId,
      templateId: tpl?.id ?? null,
      templateName: tpl?.name ?? "",
      supplier: S(d.s),
      customer: C(d.c),
      template: tpl ? tpl.doc : null,
      lines: d.lines,
      amountPaid: d.amountPaid,
      total: 0,
    };
    inv.total = compTotals(inv.lines, inv.amountPaid).total;
    return inv;
  });
}
