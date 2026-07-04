import { supabase } from "./supabase";
import { compTotals, taxOf } from "./calc";
import type { Invoice } from "./domain";

/* Invoice persistence. Filterable fields live in columns; the full render-ready
 * Invoice object is snapshotted into `doc`. */

const mem: Invoice[] = [];

function toRow(inv: Invoice) {
  const t = compTotals(inv.lines, inv.amountPaid, taxOf(inv));
  return {
    id: inv.id,
    number: inv.number,
    status: inv.status,
    currency: inv.currency,
    issue_date: inv.date,
    due_date: inv.dueDate,
    customer_name: inv.customer?.store || "",
    supplier_name: inv.supplier?.name || "",
    total: t.total,
    amount_paid: inv.amountPaid,
    template_id: inv.templateId,
    template_name: inv.templateName,
    doc: { ...inv, total: t.total },
  };
}

export async function listInvoices(): Promise<Invoice[]> {
  if (!supabase) return [...mem].reverse();
  const { data, error } = await supabase.from("invoices").select("doc,created_at").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => r.doc as Invoice);
}

export async function saveInvoice(inv: Invoice): Promise<Invoice> {
  const row = toRow(inv);
  const saved = row.doc as Invoice;
  if (!supabase) {
    const i = mem.findIndex((x) => x.id === inv.id);
    if (i >= 0) mem[i] = saved;
    else mem.push(saved);
    return saved;
  }
  const { error } = await supabase.from("invoices").upsert(row);
  if (error) throw error;
  return saved;
}

export async function deleteInvoice(id: string): Promise<void> {
  if (!supabase) {
    const i = mem.findIndex((x) => x.id === id);
    if (i >= 0) mem.splice(i, 1);
    return;
  }
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw error;
}

export async function countInvoices(): Promise<number> {
  if (!supabase) return mem.length;
  const { count, error } = await supabase.from("invoices").select("id", { count: "exact", head: true });
  if (error) throw error;
  return count || 0;
}

/** Bulk insert used only for one-time demo seeding. */
export async function insertInvoices(list: Invoice[]): Promise<void> {
  if (!supabase) {
    mem.push(...list);
    return;
  }
  const { error } = await supabase.from("invoices").insert(list.map(toRow));
  if (error) throw error;
}
