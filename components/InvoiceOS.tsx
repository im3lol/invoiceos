"use client";

import React, { useState } from "react";
import TemplateBuilder from "./TemplateBuilder";
import InvoicesView from "./InvoicesView";
import ProductsView from "./ProductsView";
import InvoiceWizard from "./InvoiceWizard";
import InvoicePaper from "./InvoicePaper";
import type { Customer, Invoice, InvoiceStatus, Product, Supplier } from "@/lib/domain";
import { genId } from "@/lib/domain";
import { money, compTotals, taxOf } from "@/lib/calc";
import { listEntities, saveEntity, saveEntities, deleteEntity } from "@/lib/entitiesApi";
import { listInvoices, saveInvoice, deleteInvoice } from "@/lib/invoicesApi";
import { listTemplates } from "@/lib/templatesApi";
import { seedDemoOnce } from "@/lib/seed";
import type { TemplateRecord } from "@/lib/templateTypes";

interface InvoiceOSProps {
  userEmail?: string;
  onSignOut?: () => void;
  onChangePassword?: (password: string) => Promise<void>;
}

interface FormState {
  open: boolean;
  type: "supplier" | "customer" | "product" | null;
  id: string | null;
  title: string;
  data: Record<string, string | number | boolean>;
}
interface State {
  view: string;
  loading: boolean;
  products: Product[];
  suppliers: Supplier[];
  customers: Customer[];
  templates: TemplateRecord[];
  invoices: Invoice[];
  form: FormState;
  editingInvoice: Invoice | null;
  previewInvoice: Invoice | null;
  changePasswordOpen: boolean;
  toast: { msg: string; kind: "err" | "ok" } | null;
}

const stColor = (s: string) => (s === "Paid" ? { bg: "#e5f6ec", fg: "#1f9d63" } : s === "Overdue" ? { bg: "#fdeaea", fg: "#d64545" } : { bg: "#fef4e3", fg: "#e0912f" });

const ENTITY_MAP = { supplier: "suppliers", customer: "customers", product: "products" } as const;
const ENTITY_LABEL = { supplier: "company", customer: "customer", product: "product" } as const;

/** Suppliers need their logo initials and tax fields coerced the same way no
 * matter which form built them — the Companies page or the wizard's quick-add. */
function normalizeSupplier(rec: Record<string, string | number | boolean>) {
  if (!rec.logoText) rec.logoText = String(rec.name || "?").slice(0, 2).toUpperCase();
  rec.taxRate = +rec.taxRate || 0;
  // Quick-add has no checkbox, so there a rate above zero is what turns tax on.
  rec.taxEnabled = rec.taxEnabled != null ? !!rec.taxEnabled : rec.taxRate > 0;
  return rec;
}

export default class InvoiceOS extends React.Component<InvoiceOSProps, State> {
  constructor(props: InvoiceOSProps) {
    super(props);
    this.state = {
      view: "dashboard",
      loading: true,
      products: [],
      suppliers: [],
      customers: [],
      templates: [],
      invoices: [],
      form: { open: false, type: null, id: null, title: "", data: {} },
      editingInvoice: null,
      previewInvoice: null,
      changePasswordOpen: false,
      toast: null,
    };
  }

  toastTimer: ReturnType<typeof setTimeout> | null = null;
  /** Surface a transient message (errors especially) so writes never fail silently. */
  notify = (msg: string, kind: "err" | "ok" = "err") => {
    this.setState({ toast: { msg, kind } });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.setState({ toast: null }), kind === "err" ? 6000 : 2500);
  };
  componentWillUnmount() {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  loadAll = () =>
    Promise.all([
      listEntities<Supplier>("suppliers"),
      listEntities<Customer>("customers"),
      listEntities<Product>("products"),
      listTemplates(),
      listInvoices(),
    ]);

  async componentDidMount() {
    try {
      let [suppliers, customers, products, templates, invoices] = await this.loadAll();
      // Seed the demo dataset only into an account that holds nothing at all —
      // so deleting your companies (but keeping invoices/templates) can't bring
      // the demo back on the next reload.
      // ponytail: no "seeded" flag stored, so wiping every table really does
      // re-seed. Add a profiles.seeded column if that ever matters.
      if (![suppliers, customers, products, templates, invoices].some((a) => a.length)) {
        await seedDemoOnce();
        [suppliers, customers, products, templates, invoices] = await this.loadAll();
      }
      this.setState({ suppliers, customers, products, templates, invoices, loading: false });
    } catch (e) {
      console.error("load failed", e);
      this.setState({ loading: false });
      this.notify("Couldn't load your data — " + (e as Error).message);
    }
  }

  setView = (v: string) => this.setState({ view: v });

  /* ---------- entity CRUD (Supabase) ---------- */
  openForm = (type: "supplier" | "customer" | "product", id?: string) => {
    const arr = this.state[ENTITY_MAP[type]] as Array<{ id: string }>;
    const existing = id ? arr.find((x) => x.id === id) : null;
    const blank: Record<string, Record<string, string>> = {
      supplier: { name: "", legal: "", taxId: "", email: "", phone: "", addr: "", website: "", logoText: "", taxRate: "" },
      customer: { store: "", contact: "", email: "", phone: "", billing: "", shipping: "", track: "" },
      product: { title: "", asin: "", sku: "", unitPrice: "", discountPct: "" },
    };
    const titles = { supplier: id ? "Edit Company" : "Add Company", customer: id ? "Edit Customer" : "Add Customer", product: id ? "Edit Product" : "Add Product" };
    this.setState({ form: { open: true, type, id: id || null, title: titles[type], data: existing ? { ...(existing as Record<string, string | number | boolean>) } : { ...blank[type] } } });
  };
  closeForm = () => this.setState({ form: { ...this.state.form, open: false } });
  onFormInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    this.setState({ form: { ...this.state.form, data: { ...this.state.form.data, [name]: value } } });
  };
  onLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // downscale to <=240px so the base64 stays small in the jsonb snapshot
        const max = 240;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/png");
        this.setState({ form: { ...this.state.form, data: { ...this.state.form.data, logoImage: dataUrl } } });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };
  clearLogo = () => this.setState({ form: { ...this.state.form, data: { ...this.state.form.data, logoImage: "" } } });
  toggleTax = (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ form: { ...this.state.form, data: { ...this.state.form.data, taxEnabled: e.target.checked } } });
  saveForm = async () => {
    const { type, id, data } = this.state.form;
    if (!type) return;
    const rec: Record<string, string | number | boolean> = { ...data, id: id || genId(type[0]) };
    if (type === "product") {
      rec.unitPrice = +rec.unitPrice || 0;
      rec.discountPct = +rec.discountPct || 0;
    }
    if (type === "supplier") normalizeSupplier(rec);
    const kind = ENTITY_MAP[type];
    try {
      const saved = await saveEntity(kind, rec);
      const arr = this.state[kind] as Array<{ id: string }>;
      const next = arr.some((x) => x.id === saved.id) ? arr.map((x) => (x.id === saved.id ? saved : x)) : [...arr, saved];
      this.setState({ [kind]: next, form: { ...this.state.form, open: false } } as unknown as Pick<State, keyof State>);
      this.notify("Saved ✓", "ok");
    } catch (e) {
      this.notify("Save failed — " + (e as Error).message);
    }
  };
  /** Bulk product import: one upsert, then merge by id (matches update in place, new ones append). */
  bulkSaveProducts = async (list: Product[]) => {
    try {
      await saveEntities("products", list);
      const byId = new Map(this.state.products.map((p) => [p.id, p]));
      list.forEach((p) => byId.set(p.id, p));
      this.setState({ products: [...byId.values()] });
      this.notify("Imported " + list.length + " products ✓", "ok");
    } catch (e) {
      this.notify("Import failed — " + (e as Error).message);
    }
  };
  removeEntity = async (type: "supplier" | "customer" | "product", id: string) => {
    const kind = ENTITY_MAP[type];
    if (!window.confirm(`Delete this ${ENTITY_LABEL[type]}? This can't be undone.`)) return;
    try {
      await deleteEntity(kind, id);
      this.setState({ [kind]: (this.state[kind] as Array<{ id: string }>).filter((x) => x.id !== id) } as unknown as Pick<State, keyof State>);
    } catch (e) {
      this.notify("Delete failed — " + (e as Error).message);
    }
  };
  createEntityFromWizard = async (kind: "suppliers" | "customers", data: Record<string, string>) => {
    const rec: Record<string, string | number | boolean> = { ...data, id: genId(kind[0]) };
    if (kind === "suppliers") normalizeSupplier(rec);
    try {
      const saved = await saveEntity(kind, rec);
      this.setState({ [kind]: [...(this.state[kind] as Array<{ id: string }>), saved] } as unknown as Pick<State, keyof State>);
      return saved as unknown as { id: string; taxEnabled?: boolean; taxRate?: number };
    } catch (e) {
      this.notify("Could not create — " + (e as Error).message);
      throw e;
    }
  };

  /* ---------- invoice ops ---------- */
  newInvoice = () => this.setState({ view: "generator", editingInvoice: null });
  editInvoice = (inv: Invoice) => this.setState({ view: "generator", editingInvoice: inv });
  onInvoiceSaved = async (inv: Invoice) => {
    try {
      const saved = await saveInvoice(inv);
      const arr = this.state.invoices;
      const next = arr.some((x) => x.id === saved.id) ? arr.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...arr];
      this.setState({ invoices: next, view: "invoices", editingInvoice: null });
      this.notify("Invoice saved ✓", "ok");
    } catch (e) {
      // Keep the wizard open (view unchanged) so the user can retry.
      this.notify("Invoice not saved — " + (e as Error).message);
    }
  };
  onDeleteInvoice = async (inv: Invoice) => {
    if (!window.confirm(`Delete invoice ${inv.number}? This can't be undone.`)) return;
    try {
      await deleteInvoice(inv.id);
      this.setState({ invoices: this.state.invoices.filter((x) => x.id !== inv.id) });
    } catch (e) {
      this.notify("Delete failed — " + (e as Error).message);
    }
  };
  onDuplicateInvoice = async (inv: Invoice) => {
    const copy: Invoice = { ...inv, id: genId("i"), number: inv.number + "-COPY", status: "Pending", lines: inv.lines.map((l) => ({ ...l })) };
    try {
      const saved = await saveInvoice(copy);
      this.setState({ invoices: [saved, ...this.state.invoices] });
      this.notify("Invoice duplicated ✓", "ok");
    } catch (e) {
      this.notify("Duplicate failed — " + (e as Error).message);
    }
  };
  onStatusChange = async (inv: Invoice, status: InvoiceStatus) => {
    const updated = { ...inv, status };
    try {
      const saved = await saveInvoice(updated);
      this.setState({ invoices: this.state.invoices.map((x) => (x.id === saved.id ? saved : x)) });
    } catch (e) {
      this.notify("Status update failed — " + (e as Error).message);
    }
  };

  /* ---------- dashboard derived ---------- */
  derive() {
    const st = this.state;
    const view = st.view;
    const navKeys = ["dashboard", "invoices", "generator", "builder", "suppliers", "customers", "products"];
    const nav: Record<string, { bg: string; fg: string }> = {};
    navKeys.forEach((k) => (nav[k] = { bg: view === k ? "#eef4fe" : "transparent", fg: view === k ? "#2f6bed" : "#5b6478" }));
    const titles: Record<string, [string, string]> = {
      dashboard: ["Dashboard", "Billing overview & performance"],
      invoices: ["Invoices", "All generated documents"],
      generator: [st.editingInvoice ? "Edit Invoice" : "New Invoice", "Build & save an invoice"],
      builder: ["Template Builder", "Design reusable invoice layouts"],
      suppliers: ["Companies", "Your selling companies & tax profiles"],
      customers: ["Customers", "Amazon buyer directory"],
      products: ["Products", "ASIN / SKU catalog"],
    };
    const totals = st.invoices.map((i) => ({ inv: i, t: compTotals(i.lines, i.amountPaid, taxOf(i)) }));
    const outstanding = totals.filter((x) => x.inv.status !== "Paid").reduce((a, x) => a + x.t.total, 0);
    const overdueCount = st.invoices.filter((i) => i.status === "Overdue").length;
    const paidCount = st.invoices.filter((i) => i.status === "Paid").length;
    const metrics = {
      invoices: String(st.invoices.length),
      products: String(st.products.length),
      outstanding: money(outstanding),
      paidLine: paidCount + " paid · " + (st.invoices.length - paidCount) + " open",
      overdueLine: overdueCount + " overdue invoices",
    };
    const recent = st.invoices.slice(0, 5);
    return { nav, titles, metrics, recent };
  }

  render() {
    const st = this.state;
    const d = this.derive();
    const formFields = this.formFields();

    return (
      <div className="app-shell" style={{ display: "flex", height: "100vh", width: "100%", overflow: "hidden", background: "#eaf0fb" }}>
        {/* Toast — surfaces save/load failures so nothing fails silently */}
        {st.toast && (
          <div
            className="no-print"
            onClick={() => this.setState({ toast: null })}
            style={{
              position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", zIndex: 200,
              maxWidth: 460, padding: "12px 18px", borderRadius: 11, cursor: "pointer",
              fontSize: 13, fontWeight: 700, color: "#fff",
              background: st.toast.kind === "err" ? "#d64545" : "#1f9d63",
              boxShadow: "0 12px 34px rgba(20,30,60,.28)", animation: "fadein .2s ease",
            }}
          >
            {st.toast.msg}
          </div>
        )}
        {/* Sidebar */}
        <aside className="no-print" style={{ width: "236px", flex: "0 0 236px", background: "#ffffff", borderRight: "1px solid #eef1f7", display: "flex", flexDirection: "column", padding: "22px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "11px", padding: "4px 8px 22px" }}>
            <div style={{ width: "34px", height: "34px", borderRadius: "9px", background: "#2f6bed", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "'Space Grotesk'", fontWeight: "700", fontSize: "17px" }}>I</div>
            <div>
              <div style={{ fontWeight: "800", fontSize: "15px", letterSpacing: "-.2px" }}>InvoiceOS</div>
              <div style={{ fontSize: "10.5px", color: "#9aa3b5", fontWeight: "600", letterSpacing: ".3px" }}>SELLER SUITE</div>
            </div>
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            {this.navItem("dashboard", "Dashboard", d.nav, <><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect></>)}
            {this.navItem("invoices", "Invoices", d.nav, <><rect x="5" y="3" width="14" height="18" rx="2"></rect><line x1="9" y1="8" x2="15" y2="8"></line><line x1="9" y1="12" x2="15" y2="12"></line><line x1="9" y1="16" x2="13" y2="16"></line></>)}
            {this.navItem("generator", "New Invoice", d.nav, <><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></>, this.newInvoice)}
            {this.navItem("builder", "Template Builder", d.nav, <><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></>)}
            <div style={{ height: "1px", background: "#eef1f7", margin: "12px 6px" }}></div>
            <div style={{ fontSize: "10.5px", color: "#aab2c4", fontWeight: "700", letterSpacing: ".5px", padding: "2px 11px 7px" }}>DATABASES</div>
            {this.navItem("suppliers", "Companies", d.nav, <><path d="M3 21V7l9-4 9 4v14"></path><line x1="3" y1="21" x2="21" y2="21"></line><rect x="9" y="12" width="6" height="9"></rect></>)}
            {this.navItem("customers", "Customers", d.nav, <><circle cx="9" cy="8" r="3.2"></circle><path d="M3.5 20a5.5 5.5 0 0 1 11 0"></path><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6"></path><path d="M18 20a5.5 5.5 0 0 0-3-4.9"></path></>)}
            {this.navItem("products", "Products", d.nav, <><path d="M3 8l9-5 9 5v8l-9 5-9-5z"></path><line x1="3" y1="8" x2="12" y2="13"></line><line x1="21" y1="8" x2="12" y2="13"></line><line x1="12" y1="13" x2="12" y2="21"></line></>)}
          </nav>
          <div style={{ marginTop: "auto", background: "#f4f7fd", border: "1px solid #e7edf9", borderRadius: "12px", padding: "13px" }}>
            <div style={{ fontSize: "11.5px", color: "#7c8598", fontWeight: "600", marginBottom: "8px" }}>Signed in as</div>
            <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "10px" }}>
              <div style={{ width: "28px", height: "28px", flex: "0 0 28px", borderRadius: "50%", background: "#dfe7f8", color: "#2f6bed", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "12px" }}>{(this.props.userEmail || "A").charAt(0).toUpperCase()}</div>
              <div style={{ fontSize: "12px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={this.props.userEmail || "Amazon Seller"}>{this.props.userEmail || "Amazon Seller"}</div>
            </div>
            {this.props.onChangePassword && (
              <button onClick={() => this.setState({ changePasswordOpen: true })} style={{ width: "100%", border: "1px solid #e2e8f5", background: "#fff", color: "#5b6478", fontWeight: "700", fontSize: "12px", padding: "7px", borderRadius: "8px", cursor: "pointer", marginBottom: "7px" }}>Change password</button>
            )}
            {this.props.onSignOut && (
              <button onClick={this.props.onSignOut} style={{ width: "100%", border: "1px solid #e2e8f5", background: "#fff", color: "#d64545", fontWeight: "700", fontSize: "12px", padding: "7px", borderRadius: "8px", cursor: "pointer" }}>Sign out</button>
            )}
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: "1", display: "flex", flexDirection: "column", minWidth: "0" }}>
          <header className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 26px", background: "#ffffff", borderBottom: "1px solid #eef1f7" }}>
            <div>
              <div style={{ fontWeight: "800", fontSize: "18px", letterSpacing: "-.3px" }}>{d.titles[st.view]?.[0]}</div>
              <div style={{ fontSize: "12px", color: "#9aa3b5", fontWeight: "500" }}>{d.titles[st.view]?.[1]}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button onClick={this.newInvoice} style={{ border: "none", background: "#2f6bed", color: "#fff", fontWeight: "700", fontSize: "13px", padding: "10px 16px", borderRadius: "9px", cursor: "pointer", boxShadow: "0 3px 10px rgba(47,107,237,.28)" }}>+ New Invoice</button>
            </div>
          </header>

          <div className="main-scroll" style={{ flex: "1", overflow: "auto", padding: "26px" }}>
            {st.loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "#9aa3b5", fontWeight: "700", fontSize: "14px" }}>Loading from Supabase…</div>
            ) : (
              <>
                {st.view === "dashboard" && this.renderDashboard(d)}
                {st.view === "invoices" && (
                  <InvoicesView
                    invoices={st.invoices}
                    onNew={this.newInvoice}
                    onOpen={this.editInvoice}
                    onDelete={this.onDeleteInvoice}
                    onDuplicate={this.onDuplicateInvoice}
                    onStatus={this.onStatusChange}
                    onPreview={(inv) => this.setState({ previewInvoice: inv })}
                  />
                )}
                {st.view === "generator" && (
                  <InvoiceWizard
                    key={st.editingInvoice?.id || "new"}
                    suppliers={st.suppliers}
                    customers={st.customers}
                    products={st.products}
                    templates={st.templates}
                    initial={st.editingInvoice}
                    onSaved={this.onInvoiceSaved}
                    onCancel={() => this.setState({ view: "invoices", editingInvoice: null })}
                    onCreateEntity={this.createEntityFromWizard}
                  />
                )}
                {st.view === "builder" && <TemplateBuilder />}
                {st.view === "suppliers" && this.renderSuppliers()}
                {st.view === "customers" && this.renderCustomers()}
                {st.view === "products" && this.renderProducts()}
              </>
            )}
          </div>
        </main>

        {/* entity modal */}
        {st.form.open && (
          <div className="no-print" style={{ position: "fixed", inset: "0", background: "rgba(20,28,50,.42)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: "50", animation: "fadein .2s ease" }}>
            <div style={{ background: "#fff", borderRadius: "18px", padding: "26px", width: "520px", maxHeight: "88vh", overflow: "auto", animation: "popin .25s ease", boxShadow: "0 24px 60px rgba(20,30,60,.3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
                <div style={{ fontWeight: "800", fontSize: "17px" }}>{st.form.title}</div>
                <button onClick={this.closeForm} style={{ border: "none", background: "#f4f6fb", color: "#7c8598", fontWeight: "800", width: "30px", height: "30px", borderRadius: "8px", cursor: "pointer" }}>×</button>
              </div>
              {st.form.type === "supplier" && (
                <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "14px", padding: "12px", background: "#f7faff", border: "1px solid #e7edf9", borderRadius: "12px" }}>
                  {st.form.data.logoImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={String(st.form.data.logoImage)} alt="logo" style={{ width: 54, height: 54, borderRadius: 10, objectFit: "contain", background: "#fff", border: "1px solid #eef1f7" }} />
                  ) : (
                    <div style={{ width: "54px", height: "54px", borderRadius: "10px", background: "#eef3fd", color: "#2f6bed", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "800", fontSize: "13px" }}>LOGO</div>
                  )}
                  <div style={{ flex: "1" }}>
                    <div style={{ fontSize: "12.5px", fontWeight: "800", marginBottom: "2px" }}>Company Logo</div>
                    <div style={{ fontSize: "10.5px", color: "#9aa3b5", fontWeight: "600" }}>PNG/JPG — shown on invoices (auto-resized)</div>
                  </div>
                  <label style={{ border: "1px solid #2f6bed", background: "#fff", color: "#2f6bed", fontWeight: "700", fontSize: "12px", padding: "8px 12px", borderRadius: "8px", cursor: "pointer" }}>
                    Upload<input type="file" accept="image/*" onChange={this.onLogoUpload} style={{ display: "none" }} />
                  </label>
                  {st.form.data.logoImage ? <button onClick={this.clearLogo} style={{ border: "1px solid #f6dfe0", background: "#fff", color: "#d64545", fontWeight: "700", fontSize: "12px", padding: "8px 10px", borderRadius: "8px", cursor: "pointer" }}>Remove</button> : null}
                </div>
              )}
              {st.form.type === "supplier" && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px", padding: "12px", background: "#f7faff", border: "1px solid #e7edf9", borderRadius: "12px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", fontWeight: "800", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!st.form.data.taxEnabled} onChange={this.toggleTax} style={{ accentColor: "#2f6bed", width: 16, height: 16 }} />
                    Charge tax on invoices
                  </label>
                  <div style={{ flex: "1" }} />
                  <input name="taxRate" value={st.form.data.taxRate != null ? String(st.form.data.taxRate) : ""} onChange={this.onFormInput} disabled={!st.form.data.taxEnabled} placeholder="14" style={{ width: 64, padding: "9px 10px", border: "1px solid #e2e8f5", borderRadius: 9, fontSize: 13, fontWeight: 700, textAlign: "right", opacity: st.form.data.taxEnabled ? 1 : 0.5 }} />
                  <span style={{ fontSize: "13px", fontWeight: "800", color: "#9aa3b5" }}>%</span>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "13px" }}>
                {formFields.map((f) => (
                  <div key={f.key} style={{ gridColumn: f.span }}>
                    <label style={{ fontSize: "11px", color: "#9aa3b5", fontWeight: "700" }}>{f.label}</label>
                    <input name={f.key} value={f.value} onChange={this.onFormInput} placeholder={f.ph} style={{ width: "100%", marginTop: "5px", padding: "10px 11px", border: "1px solid #e2e8f5", borderRadius: "9px", fontSize: "13px", fontWeight: "600" }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "22px" }}>
                <button onClick={this.saveForm} style={{ flex: "1", border: "none", background: "#2f6bed", color: "#fff", fontWeight: "700", fontSize: "13.5px", padding: "12px", borderRadius: "10px", cursor: "pointer" }}>Save</button>
                <button onClick={this.closeForm} style={{ border: "1px solid #e2e8f5", background: "#fff", color: "#1e2433", fontWeight: "700", fontSize: "13.5px", padding: "12px 18px", borderRadius: "10px", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* invoice preview modal */}
        {st.previewInvoice && (
          <div className="no-print" onClick={() => this.setState({ previewInvoice: null })} style={{ position: "fixed", inset: "0", background: "rgba(20,28,50,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: "60", padding: "30px", overflow: "auto" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => window.print()} style={{ border: "none", background: "#2f6bed", color: "#fff", fontWeight: "800", fontSize: "13px", padding: "10px 16px", borderRadius: "9px", cursor: "pointer" }}>Print / PDF</button>
                <button onClick={() => this.setState({ previewInvoice: null })} style={{ border: "1px solid #e2e8f5", background: "#fff", color: "#1e2433", fontWeight: "800", fontSize: "13px", padding: "10px 16px", borderRadius: "9px", cursor: "pointer" }}>Close</button>
              </div>
              <div className="print-area">
                <InvoicePaper invoice={st.previewInvoice} />
              </div>
            </div>
          </div>
        )}

        {/* change-password modal */}
        {st.changePasswordOpen && this.props.onChangePassword && (
          <ChangePasswordModal
            onClose={() => this.setState({ changePasswordOpen: false })}
            onSubmit={async (password) => {
              await this.props.onChangePassword!(password);
              this.notify("Password changed ✓", "ok");
            }}
          />
        )}
      </div>
    );
  }

  /* ---------- render helpers ---------- */
  navItem(key: string, label: string, nav: Record<string, { bg: string; fg: string }>, icon: React.ReactNode, onClick?: () => void) {
    return (
      <div onClick={onClick || (() => this.setView(key))} style={{ display: "flex", alignItems: "center", gap: "11px", padding: "9px 11px", borderRadius: "9px", cursor: "pointer", fontWeight: "600", fontSize: "13.5px", background: nav[key].bg, color: nav[key].fg }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>{icon}</svg>
        {label}
      </div>
    );
  }

  renderDashboard(d: ReturnType<InvoiceOS["derive"]>) {
    return (
      <div style={{ animation: "fadein .3s ease" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px", marginBottom: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "20px", border: "1px solid #eef1f7" }}>
            <div style={{ fontSize: "12px", color: "#9aa3b5", fontWeight: "700" }}>INVOICES</div>
            <div style={{ fontSize: "26px", fontWeight: "800", marginTop: "8px", letterSpacing: "-.5px", fontFamily: "'Space Grotesk'" }}>{d.metrics.invoices}</div>
            <div style={{ fontSize: "11.5px", color: "#9aa3b5", fontWeight: "600", marginTop: "6px" }}>{d.metrics.paidLine}</div>
          </div>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "20px", border: "1px solid #eef1f7" }}>
            <div style={{ fontSize: "12px", color: "#9aa3b5", fontWeight: "700" }}>ACTIVE PRODUCTS</div>
            <div style={{ fontSize: "26px", fontWeight: "800", marginTop: "8px", letterSpacing: "-.5px", fontFamily: "'Space Grotesk'" }}>{d.metrics.products}</div>
            <div style={{ fontSize: "11.5px", color: "#9aa3b5", fontWeight: "600", marginTop: "6px" }}>Barcode / UPC registry</div>
          </div>
          <div style={{ background: "#1f2937", borderRadius: "16px", padding: "20px", color: "#fff" }}>
            <div style={{ fontSize: "12px", color: "#9aab", fontWeight: "700", opacity: ".8" }}>OUTSTANDING</div>
            <div style={{ fontSize: "26px", fontWeight: "800", marginTop: "8px", letterSpacing: "-.5px", fontFamily: "'Space Grotesk'" }}>{d.metrics.outstanding}</div>
            <div style={{ fontSize: "11.5px", color: "#f7c94b", fontWeight: "700", marginTop: "6px" }}>{d.metrics.overdueLine}</div>
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: "16px", padding: "6px 22px 14px", border: "1px solid #eef1f7" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0 6px" }}>
            <div style={{ fontWeight: "800", fontSize: "15px" }}>Recent Invoices</div>
            <div onClick={() => this.setView("invoices")} style={{ fontSize: "12.5px", color: "#2f6bed", fontWeight: "700", cursor: "pointer" }}>View all →</div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ textAlign: "left" }}>
              {["INVOICE #", "CUSTOMER", "DATE", "STATUS"].map((h) => <th key={h} style={{ fontSize: "11px", color: "#9aa3b5", fontWeight: "700", padding: "8px 6px", borderBottom: "1px solid #eef1f7" }}>{h}</th>)}
              <th style={{ fontSize: "11px", color: "#9aa3b5", fontWeight: "700", padding: "8px 6px", borderBottom: "1px solid #eef1f7", textAlign: "right" }}>AMOUNT</th>
              <th style={{ borderBottom: "1px solid #eef1f7" }}></th>
            </tr></thead>
            <tbody>
              {d.recent.map((inv) => {
                const c = stColor(inv.status);
                return (
                  <tr key={inv.id}>
                    <td style={{ padding: "12px 6px", borderBottom: "1px solid #f4f6fb", fontWeight: "700", fontSize: "13px" }}>{inv.number}</td>
                    <td style={{ padding: "12px 6px", borderBottom: "1px solid #f4f6fb", fontSize: "13px" }}>{inv.customer?.store || "—"}</td>
                    <td style={{ padding: "12px 6px", borderBottom: "1px solid #f4f6fb", fontSize: "13px", color: "#7c8598" }}>{inv.date}</td>
                    <td style={{ padding: "12px 6px", borderBottom: "1px solid #f4f6fb" }}><span style={{ fontSize: "11px", fontWeight: "700", padding: "4px 9px", borderRadius: "20px", background: c.bg, color: c.fg }}>{inv.status}</span></td>
                    <td style={{ padding: "12px 6px", borderBottom: "1px solid #f4f6fb", textAlign: "right", fontWeight: "800", fontSize: "13px", fontFamily: "'Space Grotesk'" }}>{money(compTotals(inv.lines, inv.amountPaid, taxOf(inv)).total)}</td>
                    <td style={{ padding: "12px 6px", borderBottom: "1px solid #f4f6fb", textAlign: "right" }}><button onClick={() => this.editInvoice(inv)} style={{ border: "1px solid #e2e8f5", background: "#fff", color: "#2f6bed", fontWeight: "700", fontSize: "11.5px", padding: "5px 11px", borderRadius: "7px", cursor: "pointer" }}>Open</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  renderSuppliers() {
    return (
      <div style={{ animation: "fadein .3s ease" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "14px" }}><button onClick={() => this.openForm("supplier")} style={{ border: "none", background: "#2f6bed", color: "#fff", fontWeight: "700", fontSize: "13px", padding: "9px 15px", borderRadius: "9px", cursor: "pointer" }}>+ Add Company</button></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "16px" }}>
          {this.state.suppliers.map((s) => (
            <div key={s.id} style={{ background: "#fff", borderRadius: "16px", padding: "20px", border: "1px solid #eef1f7" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: "13px", alignItems: "center" }}>
                  {s.logoImage ? (
                    <img src={s.logoImage} alt={s.name} style={{ width: "44px", height: "44px", borderRadius: "11px", objectFit: "contain", background: "#fff", border: "1px solid #eef1f7" }} />
                  ) : (
                    <div style={{ width: "44px", height: "44px", borderRadius: "11px", background: "#eef3fd", color: "#2f6bed", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "800", fontSize: "16px" }}>{s.logoText}</div>
                  )}
                  <div><div style={{ fontWeight: "800", fontSize: "15px" }}>{s.name}</div><div style={{ fontSize: "12px", color: "#9aa3b5", fontWeight: "600" }}>{s.legal}</div></div>
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => this.openForm("supplier", s.id)} style={{ border: "1px solid #e2e8f5", background: "#fff", color: "#5b6478", fontWeight: "700", fontSize: "11.5px", padding: "5px 10px", borderRadius: "7px", cursor: "pointer" }}>Edit</button>
                  <button onClick={() => this.removeEntity("supplier", s.id)} style={{ border: "1px solid #f6dfe0", background: "#fff", color: "#d64545", fontWeight: "700", fontSize: "11.5px", padding: "5px 10px", borderRadius: "7px", cursor: "pointer" }}>Delete</button>
                </div>
              </div>
              <div style={{ marginTop: "15px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
                <div><div style={{ fontSize: "10.5px", color: "#9aa3b5", fontWeight: "700" }}>TAX ID / TRN</div><div style={{ fontSize: "12.5px", fontWeight: "700", color: "#1f9d63" }}>{s.taxId}</div></div>
                <div><div style={{ fontSize: "10.5px", color: "#9aa3b5", fontWeight: "700" }}>PHONE</div><div style={{ fontSize: "12.5px", fontWeight: "600" }}>{s.phone}</div></div>
                <div style={{ gridColumn: "1/3" }}><div style={{ fontSize: "10.5px", color: "#9aa3b5", fontWeight: "700" }}>ADDRESS</div><div style={{ fontSize: "12.5px", fontWeight: "500", color: "#5b6478" }}>{s.addr}</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  renderCustomers() {
    return (
      <div style={{ animation: "fadein .3s ease" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "14px" }}><button onClick={() => this.openForm("customer")} style={{ border: "none", background: "#2f6bed", color: "#fff", fontWeight: "700", fontSize: "13px", padding: "9px 15px", borderRadius: "9px", cursor: "pointer" }}>+ Add Customer</button></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "16px" }}>
          {this.state.customers.map((c) => (
            <div key={c.id} style={{ background: "#fff", borderRadius: "16px", padding: "20px", border: "1px solid #eef1f7" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div><div style={{ fontWeight: "800", fontSize: "15px" }}>{c.store}</div><div style={{ fontSize: "12px", color: "#9aa3b5", fontWeight: "600" }}>{c.contact} · {c.phone}</div></div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => this.openForm("customer", c.id)} style={{ border: "1px solid #e2e8f5", background: "#fff", color: "#5b6478", fontWeight: "700", fontSize: "11.5px", padding: "5px 10px", borderRadius: "7px", cursor: "pointer" }}>Edit</button>
                  <button onClick={() => this.removeEntity("customer", c.id)} style={{ border: "1px solid #f6dfe0", background: "#fff", color: "#d64545", fontWeight: "700", fontSize: "11.5px", padding: "5px 10px", borderRadius: "7px", cursor: "pointer" }}>Delete</button>
                </div>
              </div>
              <div style={{ marginTop: "15px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
                <div><div style={{ fontSize: "10.5px", color: "#9aa3b5", fontWeight: "700" }}>BILLING</div><div style={{ fontSize: "12px", fontWeight: "500", color: "#5b6478" }}>{c.billing}</div></div>
                <div><div style={{ fontSize: "10.5px", color: "#9aa3b5", fontWeight: "700" }}>SHIPPING</div><div style={{ fontSize: "12px", fontWeight: "500", color: "#5b6478" }}>{c.shipping}</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  renderProducts() {
    return (
      <ProductsView
        products={this.state.products}
        onAdd={() => this.openForm("product")}
        onEdit={(id) => this.openForm("product", id)}
        onDelete={(id) => this.removeEntity("product", id)}
        onBulkSave={this.bulkSaveProducts}
      />
    );
  }

  formFields() {
    const fieldDefs: Record<string, Array<[string, string, string, string]>> = {
      supplier: [["name", "Company Name", "2", "Zylker Dezigns"], ["legal", "Legal Name", "2", "Zylker Dezigns LLC"], ["taxId", "Tax ID / TRN", "1", "TRN 300..."], ["phone", "Phone", "1", "+1 ..."], ["email", "Email", "1", "billing@..."], ["website", "Website", "2", "www.company.com"], ["addr", "Address", "2", "P.O. Box ..."]],
      customer: [["store", "Amazon Store Name", "2", "Shepard Corp"], ["contact", "Contact Name", "1", "John Smith"], ["phone", "Phone", "1", "+1 ..."], ["email", "Email", "2", "buyer@..."], ["billing", "Billing Address", "2", "Street, City"], ["shipping", "Shipping Address", "2", "Street, City"], ["track", "Tracking #", "2", "RO..."]],
      product: [["title", "Product Title", "2", "Wireless Earbuds Pro"], ["asin", "Barcode / UPC", "1", "0123456789012"], ["sku", "SKU / Model", "1", "WEP-001"], ["unitPrice", "Unit Price", "1", "79.99"], ["discountPct", "Default Disc %", "1", "0"]],
    };
    const ft = this.state.form.type;
    if (!ft) return [];
    return fieldDefs[ft].map(([key, label, sp, ph]) => ({ key, label, ph, value: this.state.form.data[key] != null ? String(this.state.form.data[key]) : "", span: sp === "2" ? "1/3" : "auto" }));
  }
}

/* ---------- change password (self-service, no old password needed —
 * Supabase authorizes this off the current session, same as its own UI) ---------- */
function ChangePasswordModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (password: string) => Promise<void> }) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pass.length < 6) return setErr("Password must be at least 6 characters.");
    if (pass !== confirm) return setErr("Passwords don't match.");
    setErr("");
    setBusy(true);
    try {
      await onSubmit(pass);
      onClose();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fld: React.CSSProperties = { width: "100%", margin: "5px 0 14px", padding: "10px 12px", border: "1px solid #e2e8f5", borderRadius: 9, fontSize: 13, fontWeight: 600 };
  const lbl: React.CSSProperties = { fontSize: 11, color: "#9aa3b5", fontWeight: 700 };

  return (
    <div className="no-print" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,28,50,.42)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, animation: "fadein .2s ease" }}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 26, width: 380, animation: "popin .25s ease", boxShadow: "0 24px 60px rgba(20,30,60,.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Change Password</div>
          <button type="button" onClick={onClose} style={{ border: "none", background: "#f4f6fb", color: "#7c8598", fontWeight: 800, width: 30, height: 30, borderRadius: 8, cursor: "pointer" }}>×</button>
        </div>

        <label style={lbl}>New Password</label>
        <input type="password" required minLength={6} autoFocus value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" style={fld} />
        <label style={lbl}>Confirm Password</label>
        <input type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" style={fld} />

        {err && <div style={{ color: "#d64545", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button type="submit" disabled={busy} style={{ flex: 1, border: "none", background: "#2f6bed", color: "#fff", fontWeight: 700, fontSize: 13.5, padding: 12, borderRadius: 10, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} style={{ border: "1px solid #e2e8f5", background: "#fff", color: "#1e2433", fontWeight: 700, fontSize: 13.5, padding: "12px 18px", borderRadius: 10, cursor: "pointer" }}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
