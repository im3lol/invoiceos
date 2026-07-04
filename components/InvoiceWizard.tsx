"use client";

import React, { useMemo, useState } from "react";
import type { Customer, Invoice, InvoiceLine, InvoiceStatus, Product, Supplier } from "@/lib/domain";
import { genId } from "@/lib/domain";
import type { Column, TemplateRecord } from "@/lib/templateTypes";
import { compLine, compTotals, money, CURRENCIES } from "@/lib/calc";
import InvoicePaper from "./InvoicePaper";

type Kind = "suppliers" | "customers";

interface Draft {
  number: string;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  currency: string;
  supplierId: string;
  customerId: string;
  templateId: string | null;
  amountPaid: number;
  lines: InvoiceLine[];
}

const STEPS = ["Template", "Parties", "Products", "Review"];

export default function InvoiceWizard({
  suppliers,
  customers,
  products,
  templates,
  currency,
  initial,
  onSaved,
  onCancel,
  onCreateEntity,
}: {
  suppliers: Supplier[];
  customers: Customer[];
  products: Product[];
  templates: TemplateRecord[];
  currency: string;
  initial: Invoice | null;
  onSaved: (inv: Invoice) => void;
  onCancel: () => void;
  onCreateEntity: (kind: Kind, data: Record<string, string>) => Promise<{ id: string }>;
}) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [quickAdd, setQuickAdd] = useState<Kind | null>(null);

  const [draft, setDraft] = useState<Draft>(() =>
    initial
      ? {
          number: initial.number,
          date: initial.date,
          dueDate: initial.dueDate,
          status: initial.status,
          currency: initial.currency,
          supplierId: initial.supplierId,
          customerId: initial.customerId,
          templateId: initial.templateId,
          amountPaid: initial.amountPaid,
          lines: initial.lines.map((l) => ({ ...l })),
        }
      : {
          number: "INV-" + String(1000 + Math.floor(Math.random() * 8999)),
          date: today(),
          dueDate: today(14),
          status: "Pending",
          currency,
          supplierId: suppliers[0]?.id || "",
          customerId: customers[0]?.id || "",
          templateId: templates[0]?.id || null,
          amountPaid: 0,
          lines: [],
        },
  );

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const totals = compTotals(draft.lines, draft.amountPaid);

  /* build the render-ready Invoice from the draft */
  const buildInvoice = (): Invoice => {
    const tpl = templates.find((t) => t.id === draft.templateId) || null;
    const supplier = suppliers.find((s) => s.id === draft.supplierId) || suppliers[0];
    const customer = customers.find((c) => c.id === draft.customerId) || customers[0];
    return {
      id: initial?.id || genId("i"),
      number: draft.number,
      status: draft.status,
      currency: draft.currency,
      date: draft.date,
      dueDate: draft.dueDate,
      supplierId: draft.supplierId,
      customerId: draft.customerId,
      templateId: tpl?.id ?? null,
      templateName: tpl?.name ?? "",
      supplier,
      customer,
      template: tpl ? tpl.doc : null,
      lines: draft.lines,
      amountPaid: draft.amountPaid,
      total: compTotals(draft.lines, draft.amountPaid).total,
    };
  };

  const preview = useMemo(buildInvoice, [draft, templates, suppliers, customers, initial]); // eslint-disable-line react-hooks/exhaustive-deps

  /* line item ops */
  const addProduct = (pid: string) => {
    const p = products.find((x) => x.id === pid);
    if (!p) return;
    setDraft((d) => {
      const lines = [...d.lines];
      const ex = lines.findIndex((l) => l.productId === pid);
      if (ex >= 0) lines[ex] = { ...lines[ex], qty: (+lines[ex].qty || 0) + 1 };
      else lines.push({ productId: p.id, description: p.title, asin: p.asin, qty: 1, unitPrice: p.unitPrice, discountPct: p.discountPct, taxPct: p.taxPct });
      return { ...d, lines };
    });
    setProductQuery("");
  };
  const addBlank = () => setDraft((d) => ({ ...d, lines: [...d.lines, { productId: "", description: "", asin: "—", qty: 1, unitPrice: 0, discountPct: 0, taxPct: 0 }] }));
  const patchLine = (i: number, patch: Partial<InvoiceLine>) => setDraft((d) => ({ ...d, lines: d.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  const removeLine = (i: number) => setDraft((d) => ({ ...d, lines: d.lines.filter((_, idx) => idx !== i) }));

  const matches = useMemo(() => {
    const ql = productQuery.trim().toLowerCase();
    if (!ql) return [];
    return products.filter((p) => (p.title + " " + p.asin + " " + p.sku).toLowerCase().includes(ql)).slice(0, 6);
  }, [productQuery, products]);

  // custom columns defined on the selected template's product table → editable per line
  const customCols = useMemo(() => {
    const tpl = templates.find((t) => t.id === draft.templateId);
    const tb = tpl?.doc?.blocks?.find((b) => b.type === "productTable");
    return ((tb?.props?.columns as Column[]) || []).filter((c) => !c.hidden && c.field === "custom");
  }, [templates, draft.templateId]);

  // dropdown list: all products on focus, filtered as you type
  const dropList = productQuery.trim() ? matches : products;

  const canNext = step === 0 ? !!draft.templateId : step === 1 ? !!draft.supplierId && !!draft.customerId : step === 2 ? draft.lines.length > 0 : true;

  const save = async () => {
    setSaving(true);
    try {
      await Promise.resolve(onSaved(buildInvoice()));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ animation: "fadein .3s ease" }}>
      {/* stepper header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", border: "1px solid #eef1f7", borderRadius: 14, padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div onClick={() => i < step && setStep(i)} style={{ display: "flex", alignItems: "center", gap: 7, cursor: i < step ? "pointer" : "default" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: i <= step ? "#2f6bed" : "#eef1f7", color: i <= step ? "#fff" : "#9aa3b5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{i + 1}</div>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: i <= step ? "#1e2433" : "#9aa3b5" }}>{s}</span>
              </div>
              {i < STEPS.length - 1 && <div style={{ width: 26, height: 2, background: i < step ? "#2f6bed" : "#eef1f7" }} />}
            </React.Fragment>
          ))}
        </div>
        <button onClick={onCancel} style={ghost}>Cancel</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: step === 3 ? "1fr" : "1fr 380px", gap: 16, alignItems: "start" }}>
        {/* main step content */}
        <div style={card}>
          {step === 0 && (
            <>
              <H>Choose a template</H>
              {templates.length === 0 && <Empty>No templates yet — build one in Template Builder first.</Empty>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                {templates.map((t) => {
                  const sel = draft.templateId === t.id;
                  return (
                    <div key={t.id} onClick={() => set({ templateId: t.id })} style={{ border: sel ? "2px solid #2f6bed" : "1px solid #e6ebf5", borderRadius: 12, padding: 12, cursor: "pointer", background: sel ? "#f5f9ff" : "#fff" }}>
                      <div style={{ display: "flex", gap: 5, marginBottom: 9 }}>
                        <span style={{ width: 18, height: 18, borderRadius: 5, background: t.doc?.page?.primary || "#1f2937" }} />
                        <span style={{ width: 18, height: 18, borderRadius: 5, background: t.doc?.page?.accent || "#fde68a" }} />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
                        {t.name}
                        {t.published && <span style={{ fontSize: 8.5, color: "#1f9d63", fontWeight: 800, background: "#e5f6ec", padding: "1px 5px", borderRadius: 20 }}>LIVE</span>}
                      </div>
                      <div style={{ fontSize: 10.5, color: "#9aa3b5", fontWeight: 600, marginTop: 2 }}>{t.doc?.blocks?.length ?? 0} blocks · {t.doc?.page?.font}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <H>Parties & invoice details</H>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <PartyPicker label="Your Company (Seller)" value={draft.supplierId} onChange={(v) => set({ supplierId: v })} options={suppliers.map((s) => ({ id: s.id, label: s.name }))} onAdd={() => setQuickAdd("suppliers")} />
                <PartyPicker label="Bill To (Customer)" value={draft.customerId} onChange={(v) => set({ customerId: v })} options={customers.map((c) => ({ id: c.id, label: c.store }))} onAdd={() => setQuickAdd("customers")} />
                <Field label="Invoice #"><input value={draft.number} onChange={(e) => set({ number: e.target.value })} style={inp} /></Field>
                <Field label="Currency">
                  <select value={draft.currency} onChange={(e) => set({ currency: e.target.value })} style={inp}>
                    {CURRENCIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                  </select>
                </Field>
                <Field label="Date"><input type="date" value={toISO(draft.date)} onChange={(e) => set({ date: toDisplay(e.target.value) })} style={inp} /></Field>
                <Field label="Due Date"><input type="date" value={toISO(draft.dueDate)} onChange={(e) => set({ dueDate: toDisplay(e.target.value) })} style={inp} /></Field>
                <Field label="Status">
                  <select value={draft.status} onChange={(e) => set({ status: e.target.value as InvoiceStatus })} style={inp}>
                    <option>Pending</option>
                    <option>Paid</option>
                    <option>Overdue</option>
                  </select>
                </Field>
                <Field label="Amount Paid"><input value={String(draft.amountPaid)} onChange={(e) => set({ amountPaid: +e.target.value || 0 })} style={inp} /></Field>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <H>Add products</H>
              <div style={{ position: "relative", marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                    placeholder="Search or click to browse products (name, Barcode or SKU)…"
                    style={{ ...inp, flex: 1 }}
                  />
                  <button onClick={addBlank} style={ghost}>+ Blank row</button>
                </div>
                {searchFocused && dropList.length > 0 && (
                  <div style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: 44, background: "#fff", border: "1px solid #e2e8f5", borderRadius: 11, boxShadow: "0 14px 34px rgba(20,30,60,.18)", overflow: "auto", maxHeight: 300 }}>
                    {dropList.map((m) => (
                      <div key={m.id} className="dc-hover-row" onMouseDown={(e) => { e.preventDefault(); addProduct(m.id); }} style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid #f4f6fb" }}>
                        <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>{m.title}</div><div style={{ fontSize: 10, color: "#9aa3b5", fontWeight: 600 }}>Barcode {m.asin} · {m.sku}</div></div>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#2f6bed" }}>{money(m.unitPrice, draft.currency)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {draft.lines.map((l, i) => (
                  <div key={i} style={{ border: "1px solid #eef1f7", borderRadius: 11, padding: 11, background: "#fbfcfe" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7, gap: 8 }}>
                      <input value={l.description} onChange={(e) => patchLine(i, { description: e.target.value })} placeholder="Item description" style={{ ...inp, flex: 1, fontWeight: 700 }} />
                      <button onClick={() => removeLine(i)} style={{ border: "none", background: "#f6ecec", color: "#d64545", fontWeight: 800, width: 28, height: 28, borderRadius: 7, cursor: "pointer" }}>×</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 6, alignItems: "end" }}>
                      <Mini label="QTY"><input value={String(l.qty)} onChange={(e) => patchLine(i, { qty: e.target.value })} style={miniInp} /></Mini>
                      <Mini label="PRICE"><input value={String(l.unitPrice)} onChange={(e) => patchLine(i, { unitPrice: e.target.value })} style={miniInp} /></Mini>
                      <Mini label="DISC%"><input value={String(l.discountPct)} onChange={(e) => patchLine(i, { discountPct: e.target.value })} style={miniInp} /></Mini>
                      <Mini label="TAX%"><input value={String(l.taxPct)} onChange={(e) => patchLine(i, { taxPct: e.target.value })} style={miniInp} /></Mini>
                      <div style={{ textAlign: "right", fontSize: 12.5, fontWeight: 800, fontFamily: "'Space Grotesk'", minWidth: 84 }}>{money(compLine(l).total, draft.currency)}</div>
                    </div>
                    {customCols.length > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${customCols.length}, 1fr)`, gap: 6, marginTop: 8 }}>
                        {customCols.map((cc) => (
                          <Mini key={cc.id} label={(cc.label || "Custom").toUpperCase()}>
                            <input value={l.custom?.[cc.id] || ""} onChange={(e) => patchLine(i, { custom: { ...l.custom, [cc.id]: e.target.value } })} style={miniInp} />
                          </Mini>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {draft.lines.length === 0 && <Empty>No line items yet — search or pick a product above.</Empty>}
              </div>
            </>
          )}

          {step === 3 && (
            <div className="print-area" style={{ display: "flex", justifyContent: "center" }}>
              <InvoicePaper invoice={preview} />
            </div>
          )}
        </div>

        {/* right rail: live preview / totals (hidden on review step) */}
        {step !== 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={card}>
              <div style={label}>LIVE PREVIEW</div>
              <div style={{ background: "#f4f7fd", borderRadius: 10, padding: 10, overflow: "hidden" }}>
                <InvoicePaper invoice={preview} scale={0.46} />
              </div>
            </div>
            <div style={card}>
              <Row k="Subtotal" v={money(totals.subtotal, draft.currency)} />
              <Row k="Discount" v={"−" + money(totals.discount, draft.currency)} c="#d64545" />
              <Row k="Tax" v={money(totals.taxTotal, draft.currency)} />
              <div style={{ height: 1, background: "#eef1f7", margin: "6px 0" }} />
              <Row k="Total" v={money(totals.total, draft.currency)} strong />
            </div>
          </div>
        )}
      </div>

      {/* footer nav */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <button onClick={() => (step === 0 ? onCancel() : setStep(step - 1))} style={ghost}>{step === 0 ? "Cancel" : "← Back"}</button>
        <div style={{ display: "flex", gap: 10 }}>
          {step === 3 && <button onClick={() => window.print()} style={ghost}>Print / PDF</button>}
          {step < 3 ? (
            <button onClick={() => canNext && setStep(step + 1)} disabled={!canNext} style={{ ...primary, opacity: canNext ? 1 : 0.5 }}>Next →</button>
          ) : (
            <button onClick={save} disabled={saving} style={{ ...primary, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : initial ? "Update Invoice" : "Confirm & Save"}</button>
          )}
        </div>
      </div>

      {/* quick-add modal */}
      {quickAdd && <QuickAdd kind={quickAdd} onClose={() => setQuickAdd(null)} onCreate={async (data) => {
        const rec = await onCreateEntity(quickAdd, data);
        if (quickAdd === "suppliers") set({ supplierId: rec.id });
        else set({ customerId: rec.id });
        setQuickAdd(null);
      }} />}
    </div>
  );
}

/* ---------- quick add supplier/customer ---------- */
function QuickAdd({ kind, onClose, onCreate }: { kind: Kind; onClose: () => void; onCreate: (data: Record<string, string>) => void }) {
  const fields = kind === "suppliers"
    ? [["name", "Company Name"], ["taxId", "Tax ID / TRN"], ["phone", "Phone"], ["email", "Email"], ["website", "Website"], ["logoText", "Logo Initials"], ["addr", "Address"]]
    : [["store", "Store Name"], ["contact", "Contact Name"], ["phone", "Phone"], ["email", "Email"], ["billing", "Billing Address"], ["shipping", "Shipping Address"]];
  const [data, setData] = useState<Record<string, string>>({});
  return (
    <div className="no-print" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,28,50,.42)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, animation: "fadein .2s ease" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 24, width: 480, animation: "popin .25s ease", boxShadow: "0 24px 60px rgba(20,30,60,.3)" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>Add {kind === "suppliers" ? "Company" : "Customer"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {fields.map(([k, lbl]) => (
            <Field key={k} label={lbl}><input value={data[k] || ""} onChange={(e) => setData((d) => ({ ...d, [k]: e.target.value }))} style={inp} /></Field>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={() => onCreate(data)} style={{ ...primary, flex: 1 }}>Save & Select</button>
          <button onClick={onClose} style={ghost}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- small pieces ---------- */
function today(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
/** display string ("04 Jul 2026") -> ISO ("2026-07-04") for <input type="date">. */
function toISO(display: string): string {
  if (!display) return "";
  const d = new Date(display);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** ISO ("2026-07-04") -> display string ("04 Jul 2026"). */
function toDisplay(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
const H = ({ children }: { children: React.ReactNode }) => <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>{children}</div>;
const Empty = ({ children }: { children: React.ReactNode }) => <div style={{ padding: "20px 0", color: "#aab2c4", fontWeight: 600, fontSize: 13 }}>{children}</div>;
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ fontSize: 11, color: "#9aa3b5", fontWeight: 700 }}>{label}</label><div style={{ marginTop: 5 }}>{children}</div></div>;
}
function Mini({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div style={{ fontSize: 9.5, color: "#9aa3b5", fontWeight: 700, marginBottom: 3 }}>{label}</div>{children}</div>;
}
function PartyPicker({ label, value, onChange, options, onAdd }: { label: string; value: string; onChange: (v: string) => void; options: { id: string; label: string }[]; onAdd: () => void }) {
  return (
    <Field label={label}>
      <div style={{ display: "flex", gap: 6 }}>
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inp, flex: 1 }}>
          {options.length === 0 && <option value="">— none —</option>}
          {options.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
        </select>
        <button onClick={onAdd} style={{ ...ghost, padding: "9px 12px" }}>+ New</button>
      </div>
    </Field>
  );
}
function Row({ k, v, strong, c }: { k: string; v: string; strong?: boolean; c?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: strong ? 15 : 12.5, fontWeight: strong ? 800 : 500, padding: "3px 0" }}>
      <span style={{ color: strong ? "#1e2433" : "#7c8598" }}>{k}</span>
      <span style={{ fontWeight: strong ? 800 : 700, color: c || (strong ? "#2f6bed" : "#1e2433"), fontFamily: "'Space Grotesk'" }}>{v}</span>
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #eef1f7" };
const label: React.CSSProperties = { fontSize: 11, color: "#9aa3b5", fontWeight: 700, letterSpacing: ".4px", marginBottom: 10 };
const inp: React.CSSProperties = { width: "100%", padding: "9px 10px", border: "1px solid #e2e8f5", borderRadius: 9, fontSize: 12.5, fontWeight: 600, background: "#fff" };
const miniInp: React.CSSProperties = { width: "100%", padding: "6px", border: "1px solid #e2e8f5", borderRadius: 7, fontSize: 12, fontWeight: 700, textAlign: "center" };
const primary: React.CSSProperties = { border: "none", background: "#2f6bed", color: "#fff", fontWeight: 800, fontSize: 13, padding: "11px 18px", borderRadius: 10, cursor: "pointer" };
const ghost: React.CSSProperties = { border: "1px solid #e2e8f5", background: "#fff", color: "#1e2433", fontWeight: 800, fontSize: 12.5, padding: "10px 14px", borderRadius: 10, cursor: "pointer" };
