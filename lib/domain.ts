import type { TemplateDoc } from "./templateTypes";

/* Shared domain model for entities and invoices. */

export interface Supplier {
  id: string;
  name: string;
  legal: string;
  taxId: string;
  email: string;
  phone: string;
  addr: string;
  website?: string;
  logoText: string;
  logoImage?: string; // data URL of an uploaded logo (optional)
  taxEnabled?: boolean; // whether this company charges tax on its invoices
  taxRate?: number; // tax percentage applied to the whole invoice (e.g. 14)
}
export interface Customer {
  id: string;
  store: string;
  contact: string;
  email: string;
  phone: string;
  billing: string;
  shipping: string;
  track: string;
}
export interface Product {
  id: string;
  title: string;
  asin: string;
  sku: string;
  unitPrice: number;
  discountPct: number;
}
export interface InvoiceLine {
  productId: string;
  description: string;
  asin: string;
  qty: number | string;
  unitPrice: number | string;
  discountPct: number | string;
  custom?: Record<string, string>; // values for template custom columns, keyed by column id
}
export type InvoiceStatus = "Paid" | "Pending" | "Overdue";

/** Full, render-ready invoice. Party/template data are snapshotted so a saved
 * invoice always renders the same even if the source records later change. */
export interface Invoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  currency: string;
  date: string;
  dueDate: string;
  supplierId: string;
  customerId: string;
  templateId: string | null;
  templateName: string;
  supplier: Supplier;
  customer: Customer;
  template: TemplateDoc | null;
  lines: InvoiceLine[];
  amountPaid: number;
  taxEnabled: boolean; // snapshot of the company's tax setting (toggleable per invoice)
  taxRate: number; // tax percentage applied to this invoice
  total: number;
}

export type EntityKind = "suppliers" | "customers" | "products";

export function genId(prefix: string): string {
  return prefix + "_" + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);
}
