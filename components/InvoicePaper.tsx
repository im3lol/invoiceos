"use client";

import React from "react";
import type { Block, ColField, Column, TemplateDoc, TotalRow } from "@/lib/templateTypes";
import { defaultDoc, fontFamily } from "@/lib/templateTypes";
import type { Invoice, InvoiceLine } from "@/lib/domain";
import { compLine, compTotals, money, taxOf } from "@/lib/calc";
import { HIDE_WHEN_ZERO, fillTokens, hasToken, singleToken } from "@/lib/templateTokens";

/** Formatted + raw values for every {{token}} the totals block can reference. */
function totalsCtx(t: ReturnType<typeof compTotals>) {
  const raw: Record<string, number> = { subtotal: t.subtotal, discount: t.discount, tax: t.taxTotal, taxRate: t.taxRate, total: t.total, paid: t.paid, balance: t.balance };
  const fmt: Record<string, string> = {};
  Object.keys(raw).forEach((k) => (fmt[k] = k === "taxRate" ? String(raw[k]) : money(raw[k])));
  return { raw, fmt };
}

interface RenderCol { id: string; label: string; field: ColField; align: Column["align"]; flex: number }

/** Standard column set used when a template's product table has no field
 * bindings (older snapshots) or no visible bound columns. */
const STD_COLS: RenderCol[] = [
  { id: "s-index", label: "#", field: "index", align: "left", flex: 0.4 },
  { id: "s-desc", label: "Item & Description", field: "description", align: "left", flex: 2.6 },
  { id: "s-asin", label: "Barcode", field: "asin", align: "left", flex: 1 },
  { id: "s-qty", label: "Qty", field: "qty", align: "right", flex: 0.6 },
  { id: "s-rate", label: "Rate", field: "rate", align: "right", flex: 0.9 },
  { id: "s-disc", label: "Disc", field: "discount", align: "right", flex: 0.6 },
  { id: "s-amt", label: "Amount", field: "amount", align: "right", flex: 1 },
];

function cellValue(col: RenderCol, l: InvoiceLine, i: number): React.ReactNode {
  switch (col.field) {
    case "index": return i + 1;
    case "description": return l.description || "Item";
    case "asin": return l.asin;
    case "sku": return l.sku || "";
    case "qty": return l.qty;
    case "rate": return money(+l.unitPrice);
    case "discount": return (+l.discountPct || 0) + "%";
    case "amount": return money(compLine(l).total);
    case "custom": return (l.custom && l.custom[col.id]) || "";
    default: return "";
  }
}

/* Renders a real invoice using a template for STYLE + static content, while
 * header / addresses / product table / totals are filled with invoice data. */

function InvoicePaperBase({ invoice, scale = 1 }: { invoice: Invoice; scale?: number }) {
  const doc: TemplateDoc = invoice.template || defaultDoc();
  const S = doc.page;
  const paper = (
    <div
      className="invoice-paper"
      style={{
        width: 720,
        minHeight: 1018,
        background: "#fff",
        boxShadow: "0 12px 40px rgba(20,30,60,.14)",
        borderRadius: 6,
        padding: S.margin,
        fontFamily: fontFamily(S.font),
        color: "#1e2433",
      }}
    >
      {doc.blocks.map((b) => (
        <RenderBlock key={b.id} block={b} invoice={invoice} doc={doc} />
      ))}
    </div>
  );
  if (scale === 1) return paper;
  return (
    <div style={{ width: 720 * scale, height: 1018 * scale, overflow: "hidden" }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>{paper}</div>
    </div>
  );
}

// Memoized: skips re-render when the invoice/scale props are unchanged (e.g. while
// typing in the wizard search, which doesn't touch the memoized preview object).
const InvoicePaper = React.memo(InvoicePaperBase);
export default InvoicePaper;

function RenderBlock({ block, invoice, doc }: { block: Block; invoice: Invoice; doc: TemplateDoc }) {
  const p = block.props as Record<string, unknown>;
  const page = doc.page;
  const muted = "#8a93a6";
  const sup = invoice.supplier;
  const cus = invoice.customer;
  const lines = (s: string) => (s || "").split("\n").map((l, i) => <div key={i}>{l || " "}</div>);

  switch (block.type) {
    case "header":
      return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 26 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {(p.showLogo as boolean) &&
              (sup?.logoImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sup.logoImage} alt="logo" style={{ width: 50, height: 50, borderRadius: 10, objectFit: "contain", background: "#fff", border: "1px solid #eef1f7" }} />
              ) : (
                <div style={{ width: 50, height: 50, borderRadius: 10, background: page.accent, color: page.accentText, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18 }}>
                  {sup?.logoText || (p.logoText as string)}
                </div>
              ))}
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{sup?.name || (p.supplierName as string)}</div>
              <div style={{ fontSize: 11, color: muted, marginTop: 3, lineHeight: 1.5 }}>
                {lines([sup?.addr, sup?.taxId, sup?.phone, sup?.website].filter(Boolean).join("\n"))}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: ".5px", color: page.primary }}>{(p.title as string) || "TAX INVOICE"}</div>
            <div style={{ marginTop: 8, fontSize: 11, color: muted, lineHeight: 1.8 }}>
              <div>Invoice # <b style={{ color: "#1e2433" }}>{invoice.number}</b></div>
              {invoice.orderId && <div>Order ID <b style={{ color: "#1e2433" }}>{invoice.orderId}</b></div>}
              <div>Date <b style={{ color: "#1e2433" }}>{invoice.date}</b></div>
              <div>Due <b style={{ color: "#1e2433" }}>{invoice.dueDate}</b></div>
            </div>
          </div>
        </div>
      );
    case "addressPair":
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "1px", color: muted, textTransform: "uppercase" }}>{(p.leftLabel as string) || "Bill To"}</div>
            <div style={{ fontWeight: 800, fontSize: 14, marginTop: 6 }}>{cus?.contact || cus?.store}</div>
            <div style={{ fontSize: 11.5, color: "#5b6478", marginTop: 4, lineHeight: 1.6 }}>{lines([cus?.billing, cus?.phone].filter(Boolean).join("\n"))}</div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "1px", color: muted, textTransform: "uppercase" }}>{(p.rightLabel as string) || "Ship To"}</div>
            <div style={{ fontWeight: 800, fontSize: 14, marginTop: 6 }}>{cus?.contact || cus?.store}</div>
            <div style={{ fontSize: 11.5, color: "#5b6478", marginTop: 4, lineHeight: 1.6 }}>{lines([cus?.shipping, cus?.track ? "Track #: " + cus.track : ""].filter(Boolean).join("\n"))}</div>
          </div>
        </div>
      );
    case "productTable": {
      const raw = (p.columns as Column[]) || [];
      // Tax is invoice-level now (a totals line), so drop any legacy per-row tax column.
      const bound = raw.filter((c) => !c.hidden && c.field && (c.field as string) !== "tax").map((c) => ({ id: c.id, label: c.label, field: c.field as ColField, align: c.align, flex: c.flex }));
      const cols: RenderCol[] = bound.length ? bound : STD_COLS;
      const totalFlex = cols.reduce((a, c) => a + c.flex, 0) || 1;
      // A real <table><thead> so the browser repeats the column header on every
      // printed page — the old CSS-grid divs had no such notion of a page break.
      // borderCollapse:"separate" (not "collapse") keeps the header's rounded
      // corners from being clipped.
      return (
        <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0, marginBottom: 22 }}>
          <colgroup>
            {cols.map((c) => (
              <col key={c.id} style={{ width: (c.flex / totalFlex) * 100 + "%" }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ background: page.primary, color: "#fff" }}>
              {cols.map((c, i) => (
                <th
                  key={c.id}
                  style={{
                    textAlign: c.align,
                    padding: "10px 12px",
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: ".3px",
                    borderTopLeftRadius: i === 0 ? 6 : undefined,
                    borderTopRightRadius: i === cols.length - 1 ? 6 : undefined,
                  }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(invoice.lines || []).map((l, i) => (
              <tr key={i} style={{ breakInside: "avoid" }}>
                {cols.map((c) => (
                  <td
                    key={c.id}
                    style={{
                      textAlign: c.align,
                      padding: "11px 12px",
                      borderBottom: "1px solid #e8ecf3",
                      fontSize: c.field === "asin" ? 10.5 : 11.5,
                      fontWeight: c.field === "description" ? 700 : 400,
                      fontFamily: c.field === "asin" ? "'Space Grotesk', monospace" : undefined,
                      color: c.field === "asin" ? page.primary : c.field === "index" ? muted : undefined,
                    }}
                  >
                    {cellValue(c, l, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case "totals": {
      const t = compTotals(invoice.lines, invoice.amountPaid, taxOf(invoice));
      const row = (label: string, val: string, strong?: boolean, color?: string, key?: React.Key) => (
        <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: strong ? 14 : 12, fontWeight: strong ? 800 : 500 }}>
          <span style={{ color: strong ? "#1e2433" : muted }}>{label}</span>
          <span style={{ fontWeight: strong ? 800 : 700, color: color || "#1e2433" }}>{val}</span>
        </div>
      );

      const customRows = (p.rows as TotalRow[]) || [];
      const balanceLabel = (p.balanceLabel as string) || "Balance Due";
      const balanceValue = (p.balanceValue as string) || "";
      // A template only opts into custom totals once it actually references a
      // token — older saved templates hold literal sample numbers ("2760.00")
      // that must never print onto a real invoice, so those fall back below.
      const tokenized = customRows.some((r) => hasToken(r.label) || hasToken(r.value)) || hasToken(balanceLabel) || hasToken(balanceValue);

      if (tokenized) {
        const { raw, fmt } = totalsCtx(t);
        return (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20, breakInside: "avoid" }}>
            <div style={{ width: 270 }}>
              {customRows.map((r, i) => {
                const sole = singleToken(r.value);
                if (sole && HIDE_WHEN_ZERO.has(sole) && !raw[sole]) return null;
                return row(fillTokens(r.label, fmt), fillTokens(r.value, fmt), r.strong, undefined, i);
              })}
              {(p.showBalance as boolean) && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, padding: "9px 12px", background: page.accent, color: page.accentText, borderRadius: 6, fontSize: 12.5, fontWeight: 800 }}>
                  <span>{fillTokens(balanceLabel, fmt)}</span>
                  <span>{fillTokens(balanceValue, fmt)}</span>
                </div>
              )}
            </div>
          </div>
        );
      }

      return (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20, breakInside: "avoid" }}>
          <div style={{ width: 270 }}>
            {row("Subtotal", money(t.subtotal))}
            {row("Discount", "−" + money(t.discount), false, "#d64545")}
            {t.taxRate > 0 && row("Tax (" + t.taxRate + "%)", money(t.taxTotal))}
            <div style={{ height: 1, background: "#e8ecf3", margin: "4px 0" }} />
            {row("Total", money(t.total), true, page.primary)}
            {t.paid > 0 && row("Paid", "−" + money(t.paid), false, "#1f9d63")}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, padding: "9px 12px", background: page.accent, color: page.accentText, borderRadius: 6, fontSize: 12.5, fontWeight: 800 }}>
              <span>Balance Due</span>
              <span>{money(t.balance)}</span>
            </div>
          </div>
        </div>
      );
    }
    case "logo": {
      const sz = (p.size as number) || 54;
      return (
        <div style={{ display: "flex", justifyContent: "center", margin: "6px 0" }}>
          {sup?.logoImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sup.logoImage} alt="logo" style={{ width: sz, height: sz, borderRadius: 12, objectFit: "contain", background: "#fff", border: "1px solid #eef1f7" }} />
          ) : (
            <div style={{ width: sz, height: sz, borderRadius: 12, background: page.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22 }}>
              {sup?.logoText || (p.logoText as string)}
            </div>
          )}
        </div>
      );
    }
    case "heading":
      return <div style={{ fontSize: (p.size as number) || 18, fontWeight: 800, textAlign: (p.align as React.CSSProperties["textAlign"]) || "left", color: (p.color as string) || "#1e2433", margin: "4px 0 8px" }}>{p.text as string}</div>;
    case "text":
      return <div style={{ fontSize: (p.size as number) || 12, textAlign: (p.align as React.CSSProperties["textAlign"]) || "left", color: (p.color as string) || "#5b6478", lineHeight: 1.7, margin: "2px 0" }}>{lines(p.text as string)}</div>;
    case "divider":
      return <div style={{ height: 1, background: (p.color as string) || "#e8ecf3", margin: "12px 0" }} />;
    case "spacer":
      return <div style={{ height: (p.height as number) || 24 }} />;
    default:
      return null;
  }
}
