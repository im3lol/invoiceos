"use client";

import React from "react";
import TemplateBuilder from "./TemplateBuilder";
import InvoicesView from "./InvoicesView";
import InvoiceWizard from "./InvoiceWizard";
import InvoicePaper from "./InvoicePaper";
import type { Customer, Invoice, InvoiceStatus, Product, Supplier } from "@/lib/domain";
import { genId } from "@/lib/domain";
import { money, compTotals, CURRENCIES, taxOf } from "@/lib/calc";
import { listEntities, saveEntity, deleteEntity } from "@/lib/entitiesApi";
import { listInvoices, saveInvoice, deleteInvoice } from "@/lib/invoicesApi";
import { listTemplates } from "@/lib/templatesApi";
import { seedDemoOnce } from "@/lib/seed";
import type { TemplateRecord } from "@/lib/templateTypes";

interface InvoiceOSProps {
  userEmail?: string;
  onSignOut?: () => void;
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
  currency: string;
  loading: boolean;
  products: Product[];
  suppliers: Supplier[];
  customers: Customer[];
  templates: TemplateRecord[];
  invoices: Invoice[];
  form: FormState;
  editingInvoice: Invoice | null;
  previewInvoice: Invoice | null;
  toast: { msg: string; kind: "err" | "ok" } | null;
}

// Parsed styles are cached by their source string — the same static style
// strings recur across every render, so this avoids re-parsing on each pass.
const cssCache = new Map<string, React.CSSProperties>();
function css(s: string): React.CSSProperties {
  const hit = cssCache.get(s);
  if (hit) return hit;
  const o: Record<string, string> = {};
  s.split(";").forEach((decl) => {
    const i = decl.indexOf(":");
    if (i < 0) return;
    const k = decl.slice(0, i).trim();
    const v = decl.slice(i + 1).trim();
    if (!k) return;
    o[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  });
  const out = o as React.CSSProperties;
  cssCache.set(s, out);
  return out;
}
const stColor = (s: string) => (s === "Paid" ? { bg: "#e5f6ec", fg: "#1f9d63" } : s === "Overdue" ? { bg: "#fdeaea", fg: "#d64545" } : { bg: "#fef4e3", fg: "#e0912f" });

const ENTITY_MAP = { supplier: "suppliers", customer: "customers", product: "products" } as const;

export default class InvoiceOS extends React.Component<InvoiceOSProps, State> {
  constructor(props: InvoiceOSProps) {
    super(props);
    this.state = {
      view: "dashboard",
      currency: "EGP",
      loading: true,
      products: [],
      suppliers: [],
      customers: [],
      templates: [],
      invoices: [],
      form: { open: false, type: null, id: null, title: "", data: {} },
      editingInvoice: null,
      previewInvoice: null,
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

  async componentDidMount() {
    try {
      // Fresh account (no companies yet) → seed a demo dataset owned by this user.
      const firstLook = await listEntities<Supplier>("suppliers");
      if (firstLook.length === 0) await seedDemoOnce();
      const [suppliers, customers, products] = await Promise.all([
        listEntities<Supplier>("suppliers"),
        listEntities<Customer>("customers"),
        listEntities<Product>("products"),
      ]);
      const templates = await listTemplates();
      const invoices = await listInvoices();
      this.setState({ suppliers, customers, products, templates, invoices, loading: false });
    } catch (e) {
      console.error("load failed", e);
      this.setState({ loading: false });
      this.notify("Couldn't load your data — " + (e as Error).message);
    }
  }

  setView = (v: string) => this.setState({ view: v });
  setCurrency = (e: React.ChangeEvent<HTMLSelectElement>) => this.setState({ currency: e.target.value });

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
    if (type === "supplier") {
      if (!rec.logoText) rec.logoText = String(rec.name || "?").slice(0, 2).toUpperCase();
      rec.taxEnabled = !!rec.taxEnabled;
      rec.taxRate = +rec.taxRate || 0;
    }
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
  removeEntity = async (type: "supplier" | "customer" | "product", id: string) => {
    const kind = ENTITY_MAP[type];
    try {
      await deleteEntity(kind, id);
      this.setState({ [kind]: (this.state[kind] as Array<{ id: string }>).filter((x) => x.id !== id) } as unknown as Pick<State, keyof State>);
    } catch (e) {
      this.notify("Delete failed — " + (e as Error).message);
    }
  };
  createEntityFromWizard = async (kind: "suppliers" | "customers", data: Record<string, string>) => {
    const rec: Record<string, string> = { ...data, id: genId(kind[0]) };
    if (kind === "suppliers" && !rec.logoText) rec.logoText = String(rec.name || "?").slice(0, 2).toUpperCase();
    try {
      const saved = await saveEntity(kind, rec);
      this.setState({ [kind]: [...(this.state[kind] as Array<{ id: string }>), saved] } as unknown as Pick<State, keyof State>);
      return saved as { id: string };
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
    const cur = st.currency;
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
    const sales = totals.reduce((a, x) => a + x.t.total, 0);
    const collected = totals.filter((x) => x.inv.status === "Paid").reduce((a, x) => a + x.t.total, 0);
    const outstanding = totals.filter((x) => x.inv.status !== "Paid").reduce((a, x) => a + x.t.total, 0);
    const overdueCount = st.invoices.filter((i) => i.status === "Overdue").length;
    const paidCount = st.invoices.filter((i) => i.status === "Paid").length;
    const metrics = {
      sales: money(sales, cur),
      invoices: String(st.invoices.length),
      products: String(st.products.length),
      outstanding: money(outstanding, cur),
      collected: money(collected, cur),
      paidLine: paidCount + " paid · " + (st.invoices.length - paidCount) + " open",
      overdueLine: overdueCount + " overdue invoices",
    };
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const byMonth = months.map((m) => ({ m, v: totals.filter((x) => x.inv.date.includes(m + " 2026")).reduce((a, x) => a + x.t.total, 0) }));
    const maxV = Math.max(1, ...byMonth.map((b) => b.v));
    const chartBars = byMonth.map((b) => ({ short: b.m, label: "$" + Math.round(b.v / 1000) + "k", h: Math.max(6, Math.round((b.v / maxV) * 150)) + "px" }));
    const cum: number[] = [];
    let run = 0;
    const totalAll = sales || 1;
    byMonth.forEach((b) => { run += b.v; cum.push(run / totalAll); });
    const W = 240, H = 90;
    const pts = cum.map((v, i) => ((i / (cum.length - 1)) * W).toFixed(1) + "," + (H - v * H).toFixed(1));
    const trendChart = React.createElement(
      "svg",
      { width: "100%", viewBox: "0 0 " + W + " " + H, style: { display: "block" } },
      React.createElement("polyline", { points: 0 + "," + H + " " + pts.join(" ") + " " + (W + "," + H), fill: "#eef4fe", stroke: "none" }),
      React.createElement("polyline", { points: pts.join(" "), fill: "none", stroke: "#2f6bed", strokeWidth: 2.5, strokeLinejoin: "round", strokeLinecap: "round" }),
    );
    const recent = st.invoices.slice(0, 5);
    return { nav, titles, metrics, chartBars, trendChart, recent };
  }

  render() {
    const st = this.state;
    const d = this.derive();
    const formFields = this.formFields();

    return (
      <div className="app-shell" style={css("display:flex; height:100vh; width:100%; overflow:hidden; background:#eaf0fb;")}>
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
        <aside className="no-print" style={css("width:236px; flex:0 0 236px; background:#ffffff; border-right:1px solid #eef1f7; display:flex; flex-direction:column; padding:22px 16px;")}>
          <div style={css("display:flex; align-items:center; gap:11px; padding:4px 8px 22px;")}>
            <div style={css("width:34px; height:34px; border-radius:9px; background:#2f6bed; display:flex; align-items:center; justify-content:center; color:#fff; font-family:'Space Grotesk'; font-weight:700; font-size:17px;")}>I</div>
            <div>
              <div style={css("font-weight:800; font-size:15px; letter-spacing:-.2px;")}>InvoiceOS</div>
              <div style={css("font-size:10.5px; color:#9aa3b5; font-weight:600; letter-spacing:.3px;")}>SELLER SUITE</div>
            </div>
          </div>
          <nav style={css("display:flex; flex-direction:column; gap:3px;")}>
            {this.navItem("dashboard", "Dashboard", d.nav, <><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect></>)}
            {this.navItem("invoices", "Invoices", d.nav, <><rect x="5" y="3" width="14" height="18" rx="2"></rect><line x1="9" y1="8" x2="15" y2="8"></line><line x1="9" y1="12" x2="15" y2="12"></line><line x1="9" y1="16" x2="13" y2="16"></line></>)}
            {this.navItem("generator", "New Invoice", d.nav, <><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></>, this.newInvoice)}
            {this.navItem("builder", "Template Builder", d.nav, <><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></>)}
            <div style={css("height:1px; background:#eef1f7; margin:12px 6px;")}></div>
            <div style={css("font-size:10.5px; color:#aab2c4; font-weight:700; letter-spacing:.5px; padding:2px 11px 7px;")}>DATABASES</div>
            {this.navItem("suppliers", "Companies", d.nav, <><path d="M3 21V7l9-4 9 4v14"></path><line x1="3" y1="21" x2="21" y2="21"></line><rect x="9" y="12" width="6" height="9"></rect></>)}
            {this.navItem("customers", "Customers", d.nav, <><circle cx="9" cy="8" r="3.2"></circle><path d="M3.5 20a5.5 5.5 0 0 1 11 0"></path><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6"></path><path d="M18 20a5.5 5.5 0 0 0-3-4.9"></path></>)}
            {this.navItem("products", "Products", d.nav, <><path d="M3 8l9-5 9 5v8l-9 5-9-5z"></path><line x1="3" y1="8" x2="12" y2="13"></line><line x1="21" y1="8" x2="12" y2="13"></line><line x1="12" y1="13" x2="12" y2="21"></line></>)}
          </nav>
          <div style={css("margin-top:auto; background:#f4f7fd; border:1px solid #e7edf9; border-radius:12px; padding:13px;")}>
            <div style={css("font-size:11.5px; color:#7c8598; font-weight:600; margin-bottom:8px;")}>Signed in as</div>
            <div style={css("display:flex; align-items:center; gap:9px; margin-bottom:10px;")}>
              <div style={css("width:28px; height:28px; flex:0 0 28px; border-radius:50%; background:#dfe7f8; color:#2f6bed; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px;")}>{(this.props.userEmail || "A").charAt(0).toUpperCase()}</div>
              <div style={css("font-size:12px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;")} title={this.props.userEmail || "Amazon Seller"}>{this.props.userEmail || "Amazon Seller"}</div>
            </div>
            {this.props.onSignOut && (
              <button onClick={this.props.onSignOut} style={css("width:100%; border:1px solid #e2e8f5; background:#fff; color:#d64545; font-weight:700; font-size:12px; padding:7px; border-radius:8px; cursor:pointer;")}>Sign out</button>
            )}
          </div>
        </aside>

        {/* Main */}
        <main style={css("flex:1; display:flex; flex-direction:column; min-width:0;")}>
          <header className="no-print" style={css("display:flex; align-items:center; justify-content:space-between; padding:15px 26px; background:#ffffff; border-bottom:1px solid #eef1f7;")}>
            <div>
              <div style={css("font-weight:800; font-size:18px; letter-spacing:-.3px;")}>{d.titles[st.view]?.[0]}</div>
              <div style={css("font-size:12px; color:#9aa3b5; font-weight:500;")}>{d.titles[st.view]?.[1]}</div>
            </div>
            <div style={css("display:flex; align-items:center; gap:12px;")}>
              <div style={css("display:flex; align-items:center; background:#f1f4fb; border-radius:9px; padding:3px;")}>
                <span style={css("font-size:11px; color:#9aa3b5; font-weight:700; padding:0 8px;")}>CURRENCY</span>
                <select value={st.currency} onChange={this.setCurrency} style={css("border:none; background:#fff; border-radius:7px; padding:6px 8px; font-size:12.5px; font-weight:700; color:#1e2433; cursor:pointer; box-shadow:0 1px 2px rgba(20,30,60,.06);")}>
                  {CURRENCIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                </select>
              </div>
              <button onClick={this.newInvoice} style={css("border:none; background:#2f6bed; color:#fff; font-weight:700; font-size:13px; padding:10px 16px; border-radius:9px; cursor:pointer; box-shadow:0 3px 10px rgba(47,107,237,.28);")}>+ New Invoice</button>
            </div>
          </header>

          <div className="main-scroll" style={css("flex:1; overflow:auto; padding:26px;")}>
            {st.loading ? (
              <div style={css("display:flex; align-items:center; justify-content:center; height:60vh; color:#9aa3b5; font-weight:700; font-size:14px;")}>Loading from Supabase…</div>
            ) : (
              <>
                {st.view === "dashboard" && this.renderDashboard(d)}
                {st.view === "invoices" && (
                  <InvoicesView
                    invoices={st.invoices}
                    currency={st.currency}
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
                    currency={st.currency}
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
          <div className="no-print" style={css("position:fixed; inset:0; background:rgba(20,28,50,.42); display:flex; align-items:center; justify-content:center; z-index:50; animation:fadein .2s ease;")}>
            <div style={css("background:#fff; border-radius:18px; padding:26px; width:520px; max-height:88vh; overflow:auto; animation:popin .25s ease; box-shadow:0 24px 60px rgba(20,30,60,.3);")}>
              <div style={css("display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;")}>
                <div style={css("font-weight:800; font-size:17px;")}>{st.form.title}</div>
                <button onClick={this.closeForm} style={css("border:none; background:#f4f6fb; color:#7c8598; font-weight:800; width:30px; height:30px; border-radius:8px; cursor:pointer;")}>×</button>
              </div>
              {st.form.type === "supplier" && (
                <div style={css("display:flex; align-items:center; gap:14px; margin-bottom:14px; padding:12px; background:#f7faff; border:1px solid #e7edf9; border-radius:12px;")}>
                  {st.form.data.logoImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={String(st.form.data.logoImage)} alt="logo" style={{ width: 54, height: 54, borderRadius: 10, objectFit: "contain", background: "#fff", border: "1px solid #eef1f7" }} />
                  ) : (
                    <div style={css("width:54px; height:54px; border-radius:10px; background:#eef3fd; color:#2f6bed; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:13px;")}>LOGO</div>
                  )}
                  <div style={css("flex:1;")}>
                    <div style={css("font-size:12.5px; font-weight:800; margin-bottom:2px;")}>Company Logo</div>
                    <div style={css("font-size:10.5px; color:#9aa3b5; font-weight:600;")}>PNG/JPG — shown on invoices (auto-resized)</div>
                  </div>
                  <label style={css("border:1px solid #2f6bed; background:#fff; color:#2f6bed; font-weight:700; font-size:12px; padding:8px 12px; border-radius:8px; cursor:pointer;")}>
                    Upload<input type="file" accept="image/*" onChange={this.onLogoUpload} style={{ display: "none" }} />
                  </label>
                  {st.form.data.logoImage ? <button onClick={this.clearLogo} style={css("border:1px solid #f6dfe0; background:#fff; color:#d64545; font-weight:700; font-size:12px; padding:8px 10px; border-radius:8px; cursor:pointer;")}>Remove</button> : null}
                </div>
              )}
              {st.form.type === "supplier" && (
                <div style={css("display:flex; align-items:center; gap:12px; margin-bottom:14px; padding:12px; background:#f7faff; border:1px solid #e7edf9; border-radius:12px;")}>
                  <label style={css("display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:800; cursor:pointer;")}>
                    <input type="checkbox" checked={!!st.form.data.taxEnabled} onChange={this.toggleTax} style={{ accentColor: "#2f6bed", width: 16, height: 16 }} />
                    Charge tax on invoices
                  </label>
                  <div style={css("flex:1;")} />
                  <input name="taxRate" value={st.form.data.taxRate != null ? String(st.form.data.taxRate) : ""} onChange={this.onFormInput} disabled={!st.form.data.taxEnabled} placeholder="14" style={{ width: 64, padding: "9px 10px", border: "1px solid #e2e8f5", borderRadius: 9, fontSize: 13, fontWeight: 700, textAlign: "right", opacity: st.form.data.taxEnabled ? 1 : 0.5 }} />
                  <span style={css("font-size:13px; font-weight:800; color:#9aa3b5;")}>%</span>
                </div>
              )}
              <div style={css("display:grid; grid-template-columns:1fr 1fr; gap:13px;")}>
                {formFields.map((f) => (
                  <div key={f.key} style={css(`grid-column:${f.span};`)}>
                    <label style={css("font-size:11px; color:#9aa3b5; font-weight:700;")}>{f.label}</label>
                    <input name={f.key} value={f.value} onChange={this.onFormInput} placeholder={f.ph} style={css("width:100%; margin-top:5px; padding:10px 11px; border:1px solid #e2e8f5; border-radius:9px; font-size:13px; font-weight:600;")} />
                  </div>
                ))}
              </div>
              <div style={css("display:flex; gap:10px; margin-top:22px;")}>
                <button onClick={this.saveForm} style={css("flex:1; border:none; background:#2f6bed; color:#fff; font-weight:700; font-size:13.5px; padding:12px; border-radius:10px; cursor:pointer;")}>Save</button>
                <button onClick={this.closeForm} style={css("border:1px solid #e2e8f5; background:#fff; color:#1e2433; font-weight:700; font-size:13.5px; padding:12px 18px; border-radius:10px; cursor:pointer;")}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* invoice preview modal */}
        {st.previewInvoice && (
          <div className="no-print" onClick={() => this.setState({ previewInvoice: null })} style={css("position:fixed; inset:0; background:rgba(20,28,50,.5); display:flex; align-items:flex-start; justify-content:center; z-index:60; padding:30px; overflow:auto;")}>
            <div onClick={(e) => e.stopPropagation()} style={css("display:flex; flex-direction:column; gap:12px; align-items:center;")}>
              <div style={css("display:flex; gap:10px;")}>
                <button onClick={() => window.print()} style={css("border:none; background:#2f6bed; color:#fff; font-weight:800; font-size:13px; padding:10px 16px; border-radius:9px; cursor:pointer;")}>Print / PDF</button>
                <button onClick={() => this.setState({ previewInvoice: null })} style={css("border:1px solid #e2e8f5; background:#fff; color:#1e2433; font-weight:800; font-size:13px; padding:10px 16px; border-radius:9px; cursor:pointer;")}>Close</button>
              </div>
              <div className="print-area">
                <InvoicePaper invoice={st.previewInvoice} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ---------- render helpers ---------- */
  navItem(key: string, label: string, nav: Record<string, { bg: string; fg: string }>, icon: React.ReactNode, onClick?: () => void) {
    return (
      <div onClick={onClick || (() => this.setView(key))} style={css(`display:flex; align-items:center; gap:11px; padding:9px 11px; border-radius:9px; cursor:pointer; font-weight:600; font-size:13.5px; background:${nav[key].bg}; color:${nav[key].fg};`)}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>{icon}</svg>
        {label}
      </div>
    );
  }

  renderDashboard(d: ReturnType<InvoiceOS["derive"]>) {
    const cur = this.state.currency;
    return (
      <div style={css("animation:fadein .3s ease;")}>
        <div style={css("display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:20px;")}>
          <div style={css("background:#fff; border-radius:16px; padding:20px; border:1px solid #eef1f7;")}>
            <div style={css("font-size:12px; color:#9aa3b5; font-weight:700;")}>TOTAL SALES</div>
            <div style={css("font-size:26px; font-weight:800; margin-top:8px; letter-spacing:-.5px; font-family:'Space Grotesk';")}>{d.metrics.sales}</div>
            <div style={css("font-size:11.5px; color:#1f9d63; font-weight:700; margin-top:6px;")}>▲ 12.4% vs last period</div>
          </div>
          <div style={css("background:#fff; border-radius:16px; padding:20px; border:1px solid #eef1f7;")}>
            <div style={css("font-size:12px; color:#9aa3b5; font-weight:700;")}>INVOICES</div>
            <div style={css("font-size:26px; font-weight:800; margin-top:8px; letter-spacing:-.5px; font-family:'Space Grotesk';")}>{d.metrics.invoices}</div>
            <div style={css("font-size:11.5px; color:#9aa3b5; font-weight:600; margin-top:6px;")}>{d.metrics.paidLine}</div>
          </div>
          <div style={css("background:#fff; border-radius:16px; padding:20px; border:1px solid #eef1f7;")}>
            <div style={css("font-size:12px; color:#9aa3b5; font-weight:700;")}>ACTIVE PRODUCTS</div>
            <div style={css("font-size:26px; font-weight:800; margin-top:8px; letter-spacing:-.5px; font-family:'Space Grotesk';")}>{d.metrics.products}</div>
            <div style={css("font-size:11.5px; color:#9aa3b5; font-weight:600; margin-top:6px;")}>Barcode / UPC registry</div>
          </div>
          <div style={css("background:#1f2937; border-radius:16px; padding:20px; color:#fff;")}>
            <div style={css("font-size:12px; color:#9aab; font-weight:700; opacity:.8;")}>OUTSTANDING</div>
            <div style={css("font-size:26px; font-weight:800; margin-top:8px; letter-spacing:-.5px; font-family:'Space Grotesk';")}>{d.metrics.outstanding}</div>
            <div style={css("font-size:11.5px; color:#f7c94b; font-weight:700; margin-top:6px;")}>{d.metrics.overdueLine}</div>
          </div>
        </div>

        <div style={css("display:grid; grid-template-columns:1.55fr 1fr; gap:16px; margin-bottom:20px;")}>
          <div style={css("background:#fff; border-radius:16px; padding:22px; border:1px solid #eef1f7;")}>
            <div style={css("display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;")}>
              <div style={css("font-weight:800; font-size:15px;")}>Billing Trend</div>
              <div style={css("font-size:11.5px; color:#9aa3b5; font-weight:700;")}>2026 · monthly</div>
            </div>
            <div style={css("display:flex; align-items:flex-end; gap:14px; height:180px; padding-bottom:4px;")}>
              {d.chartBars.map((bar, i) => (
                <div key={i} style={css("flex:1; display:flex; flex-direction:column; align-items:center; gap:8px; height:100%; justify-content:flex-end;")}>
                  <div style={css("font-size:10.5px; font-weight:700; color:#7c8598;")}>{bar.short}</div>
                  <div style={css(`width:100%; max-width:38px; background:linear-gradient(180deg,#4f86f0,#2f6bed); border-radius:7px 7px 3px 3px; height:${bar.h};`)}></div>
                  <div style={css("font-size:11px; font-weight:700; color:#5b6478;")}>{bar.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={css("background:#fff; border-radius:16px; padding:22px; border:1px solid #eef1f7; display:flex; flex-direction:column;")}>
            <div style={css("font-weight:800; font-size:15px; margin-bottom:4px;")}>Collection Rate</div>
            <div style={css("font-size:12px; color:#9aa3b5; font-weight:600; margin-bottom:14px;")}>Paid vs outstanding</div>
            {d.trendChart}
            <div style={css("display:flex; gap:18px; margin-top:16px;")}>
              <div><div style={css("font-size:11px; color:#9aa3b5; font-weight:700;")}>COLLECTED</div><div style={css("font-size:16px; font-weight:800; color:#1f9d63;")}>{d.metrics.collected}</div></div>
              <div><div style={css("font-size:11px; color:#9aa3b5; font-weight:700;")}>PENDING</div><div style={css("font-size:16px; font-weight:800; color:#e0912f;")}>{d.metrics.outstanding}</div></div>
            </div>
          </div>
        </div>

        <div style={css("background:#fff; border-radius:16px; padding:6px 22px 14px; border:1px solid #eef1f7;")}>
          <div style={css("display:flex; justify-content:space-between; align-items:center; padding:16px 0 6px;")}>
            <div style={css("font-weight:800; font-size:15px;")}>Recent Invoices</div>
            <div onClick={() => this.setView("invoices")} style={css("font-size:12.5px; color:#2f6bed; font-weight:700; cursor:pointer;")}>View all →</div>
          </div>
          <table style={css("width:100%; border-collapse:collapse;")}>
            <thead><tr style={css("text-align:left;")}>
              {["INVOICE #", "CUSTOMER", "DATE", "STATUS"].map((h) => <th key={h} style={css("font-size:11px; color:#9aa3b5; font-weight:700; padding:8px 6px; border-bottom:1px solid #eef1f7;")}>{h}</th>)}
              <th style={css("font-size:11px; color:#9aa3b5; font-weight:700; padding:8px 6px; border-bottom:1px solid #eef1f7; text-align:right;")}>AMOUNT</th>
              <th style={css("border-bottom:1px solid #eef1f7;")}></th>
            </tr></thead>
            <tbody>
              {d.recent.map((inv) => {
                const c = stColor(inv.status);
                return (
                  <tr key={inv.id}>
                    <td style={css("padding:12px 6px; border-bottom:1px solid #f4f6fb; font-weight:700; font-size:13px;")}>{inv.number}</td>
                    <td style={css("padding:12px 6px; border-bottom:1px solid #f4f6fb; font-size:13px;")}>{inv.customer?.store || "—"}</td>
                    <td style={css("padding:12px 6px; border-bottom:1px solid #f4f6fb; font-size:13px; color:#7c8598;")}>{inv.date}</td>
                    <td style={css("padding:12px 6px; border-bottom:1px solid #f4f6fb;")}><span style={css(`font-size:11px; font-weight:700; padding:4px 9px; border-radius:20px; background:${c.bg}; color:${c.fg};`)}>{inv.status}</span></td>
                    <td style={css("padding:12px 6px; border-bottom:1px solid #f4f6fb; text-align:right; font-weight:800; font-size:13px; font-family:'Space Grotesk';")}>{money(compTotals(inv.lines, inv.amountPaid, taxOf(inv)).total, cur)}</td>
                    <td style={css("padding:12px 6px; border-bottom:1px solid #f4f6fb; text-align:right;")}><button onClick={() => this.editInvoice(inv)} style={css("border:1px solid #e2e8f5; background:#fff; color:#2f6bed; font-weight:700; font-size:11.5px; padding:5px 11px; border-radius:7px; cursor:pointer;")}>Open</button></td>
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
      <div style={css("animation:fadein .3s ease;")}>
        <div style={css("display:flex; justify-content:flex-end; margin-bottom:14px;")}><button onClick={() => this.openForm("supplier")} style={css("border:none; background:#2f6bed; color:#fff; font-weight:700; font-size:13px; padding:9px 15px; border-radius:9px; cursor:pointer;")}>+ Add Company</button></div>
        <div style={css("display:grid; grid-template-columns:repeat(2,1fr); gap:16px;")}>
          {this.state.suppliers.map((s) => (
            <div key={s.id} style={css("background:#fff; border-radius:16px; padding:20px; border:1px solid #eef1f7;")}>
              <div style={css("display:flex; justify-content:space-between; align-items:flex-start;")}>
                <div style={css("display:flex; gap:13px; align-items:center;")}>
                  {s.logoImage ? (
                    <img src={s.logoImage} alt={s.name} style={css("width:44px; height:44px; border-radius:11px; object-fit:contain; background:#fff; border:1px solid #eef1f7;")} />
                  ) : (
                    <div style={css("width:44px; height:44px; border-radius:11px; background:#eef3fd; color:#2f6bed; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:16px;")}>{s.logoText}</div>
                  )}
                  <div><div style={css("font-weight:800; font-size:15px;")}>{s.name}</div><div style={css("font-size:12px; color:#9aa3b5; font-weight:600;")}>{s.legal}</div></div>
                </div>
                <div style={css("display:flex; gap:6px;")}>
                  <button onClick={() => this.openForm("supplier", s.id)} style={css("border:1px solid #e2e8f5; background:#fff; color:#5b6478; font-weight:700; font-size:11.5px; padding:5px 10px; border-radius:7px; cursor:pointer;")}>Edit</button>
                  <button onClick={() => this.removeEntity("supplier", s.id)} style={css("border:1px solid #f6dfe0; background:#fff; color:#d64545; font-weight:700; font-size:11.5px; padding:5px 10px; border-radius:7px; cursor:pointer;")}>Delete</button>
                </div>
              </div>
              <div style={css("margin-top:15px; display:grid; grid-template-columns:1fr 1fr; gap:10px 14px;")}>
                <div><div style={css("font-size:10.5px; color:#9aa3b5; font-weight:700;")}>TAX ID / TRN</div><div style={css("font-size:12.5px; font-weight:700; color:#1f9d63;")}>{s.taxId}</div></div>
                <div><div style={css("font-size:10.5px; color:#9aa3b5; font-weight:700;")}>PHONE</div><div style={css("font-size:12.5px; font-weight:600;")}>{s.phone}</div></div>
                <div style={css("grid-column:1/3;")}><div style={css("font-size:10.5px; color:#9aa3b5; font-weight:700;")}>ADDRESS</div><div style={css("font-size:12.5px; font-weight:500; color:#5b6478;")}>{s.addr}</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  renderCustomers() {
    return (
      <div style={css("animation:fadein .3s ease;")}>
        <div style={css("display:flex; justify-content:flex-end; margin-bottom:14px;")}><button onClick={() => this.openForm("customer")} style={css("border:none; background:#2f6bed; color:#fff; font-weight:700; font-size:13px; padding:9px 15px; border-radius:9px; cursor:pointer;")}>+ Add Customer</button></div>
        <div style={css("display:grid; grid-template-columns:repeat(2,1fr); gap:16px;")}>
          {this.state.customers.map((c) => (
            <div key={c.id} style={css("background:#fff; border-radius:16px; padding:20px; border:1px solid #eef1f7;")}>
              <div style={css("display:flex; justify-content:space-between; align-items:flex-start;")}>
                <div><div style={css("font-weight:800; font-size:15px;")}>{c.store}</div><div style={css("font-size:12px; color:#9aa3b5; font-weight:600;")}>{c.contact} · {c.phone}</div></div>
                <div style={css("display:flex; gap:6px;")}>
                  <button onClick={() => this.openForm("customer", c.id)} style={css("border:1px solid #e2e8f5; background:#fff; color:#5b6478; font-weight:700; font-size:11.5px; padding:5px 10px; border-radius:7px; cursor:pointer;")}>Edit</button>
                  <button onClick={() => this.removeEntity("customer", c.id)} style={css("border:1px solid #f6dfe0; background:#fff; color:#d64545; font-weight:700; font-size:11.5px; padding:5px 10px; border-radius:7px; cursor:pointer;")}>Delete</button>
                </div>
              </div>
              <div style={css("margin-top:15px; display:grid; grid-template-columns:1fr 1fr; gap:10px 14px;")}>
                <div><div style={css("font-size:10.5px; color:#9aa3b5; font-weight:700;")}>BILLING</div><div style={css("font-size:12px; font-weight:500; color:#5b6478;")}>{c.billing}</div></div>
                <div><div style={css("font-size:10.5px; color:#9aa3b5; font-weight:700;")}>SHIPPING</div><div style={css("font-size:12px; font-weight:500; color:#5b6478;")}>{c.shipping}</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  renderProducts() {
    const cur = this.state.currency;
    return (
      <div style={css("animation:fadein .3s ease;")}>
        <div style={css("display:flex; justify-content:flex-end; margin-bottom:14px;")}><button onClick={() => this.openForm("product")} style={css("border:none; background:#2f6bed; color:#fff; font-weight:700; font-size:13px; padding:9px 15px; border-radius:9px; cursor:pointer;")}>+ Add Product</button></div>
        <div style={css("background:#fff; border-radius:16px; padding:6px 22px 16px; border:1px solid #eef1f7;")}>
          <table style={css("width:100%; border-collapse:collapse;")}>
            <thead><tr style={css("text-align:left;")}>
              <th style={css("font-size:11px; color:#9aa3b5; font-weight:700; padding:14px 6px 10px; border-bottom:1px solid #eef1f7;")}>PRODUCT TITLE</th>
              <th style={css("font-size:11px; color:#9aa3b5; font-weight:700; padding:14px 6px 10px; border-bottom:1px solid #eef1f7;")}>BARCODE / SKU</th>
              <th style={css("font-size:11px; color:#9aa3b5; font-weight:700; padding:14px 6px 10px; border-bottom:1px solid #eef1f7; text-align:right;")}>UNIT PRICE</th>
              <th style={css("font-size:11px; color:#9aa3b5; font-weight:700; padding:14px 6px 10px; border-bottom:1px solid #eef1f7; text-align:right;")}>DISC %</th>
              <th style={css("border-bottom:1px solid #eef1f7;")}></th>
            </tr></thead>
            <tbody>
              {this.state.products.map((p) => (
                <tr key={p.id}>
                  <td style={css("padding:12px 6px; border-bottom:1px solid #f4f6fb; font-weight:700; font-size:13px;")}>{p.title}</td>
                  <td style={css("padding:12px 6px; border-bottom:1px solid #f4f6fb; font-size:12.5px;")}><span style={css("font-family:'Space Grotesk'; font-weight:600; color:#2f6bed;")}>{p.asin}</span> <span style={css("color:#9aa3b5;")}>/ {p.sku}</span></td>
                  <td style={css("padding:12px 6px; border-bottom:1px solid #f4f6fb; text-align:right; font-weight:800; font-size:13px; font-family:'Space Grotesk';")}>{money(p.unitPrice, cur)}</td>
                  <td style={css("padding:12px 6px; border-bottom:1px solid #f4f6fb; text-align:right; font-size:13px;")}>{p.discountPct}%</td>
                  <td style={css("padding:12px 6px; border-bottom:1px solid #f4f6fb; text-align:right;")}>
                    <button onClick={() => this.openForm("product", p.id)} style={css("border:1px solid #e2e8f5; background:#fff; color:#5b6478; font-weight:700; font-size:11.5px; padding:5px 10px; border-radius:7px; cursor:pointer; margin-right:5px;")}>Edit</button>
                    <button onClick={() => this.removeEntity("product", p.id)} style={css("border:1px solid #f6dfe0; background:#fff; color:#d64545; font-weight:700; font-size:11.5px; padding:5px 10px; border-radius:7px; cursor:pointer;")}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
