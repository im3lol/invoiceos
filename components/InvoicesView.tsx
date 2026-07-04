"use client";

import React, { useMemo, useState } from "react";
import type { Invoice, InvoiceStatus } from "@/lib/domain";
import { compTotals, money, taxOf } from "@/lib/calc";

const STATUSES: InvoiceStatus[] = ["Paid", "Pending", "Overdue"];
const stColor = (s: string) => (s === "Paid" ? { bg: "#e5f6ec", fg: "#1f9d63" } : s === "Overdue" ? { bg: "#fdeaea", fg: "#d64545" } : { bg: "#fef4e3", fg: "#e0912f" });

export default function InvoicesView({
  invoices,
  currency,
  onNew,
  onOpen,
  onDelete,
  onDuplicate,
  onStatus,
  onPreview,
}: {
  invoices: Invoice[];
  currency: string;
  onNew: () => void;
  onOpen: (inv: Invoice) => void;
  onDelete: (inv: Invoice) => void;
  onDuplicate: (inv: Invoice) => void;
  onStatus: (inv: Invoice, status: InvoiceStatus) => void;
  onPreview: (inv: Invoice) => void;
}) {
  const [q, setQ] = useState("");
  const [status, setStatusFilter] = useState<"All" | InvoiceStatus>("All");
  const [sort, setSort] = useState<"new" | "amount">("new");

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let list = invoices.filter((i) => {
      if (status !== "All" && i.status !== status) return false;
      if (!ql) return true;
      return (i.number + " " + (i.customer?.store || "") + " " + i.templateName).toLowerCase().includes(ql);
    });
    if (sort === "amount") list = [...list].sort((a, b) => compTotals(b.lines, b.amountPaid, taxOf(b)).total - compTotals(a.lines, a.amountPaid, taxOf(a)).total);
    return list;
  }, [invoices, q, status, sort]);

  const th: React.CSSProperties = { fontSize: 11, color: "#9aa3b5", fontWeight: 700, padding: "14px 8px 10px", borderBottom: "1px solid #eef1f7", textAlign: "left" };
  const td: React.CSSProperties = { padding: "12px 8px", borderBottom: "1px solid #f4f6fb", fontSize: 13 };

  return (
    <div style={{ animation: "fadein .3s ease" }}>
      {/* filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search invoice # or customer…"
          style={{ flex: 1, minWidth: 220, padding: "10px 12px", border: "1px solid #e2e8f5", borderRadius: 10, fontSize: 13, fontWeight: 600, background: "#fff" }}
        />
        <div style={{ display: "flex", background: "#fff", border: "1px solid #eef1f7", borderRadius: 10, padding: 3 }}>
          {(["All", ...STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                border: "none",
                background: status === s ? "#2f6bed" : "transparent",
                color: status === s ? "#fff" : "#5b6478",
                fontWeight: 700,
                fontSize: 12,
                padding: "7px 12px",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as "new" | "amount")} style={{ border: "1px solid #e2e8f5", borderRadius: 10, padding: "9px 10px", fontSize: 12.5, fontWeight: 700, background: "#fff" }}>
          <option value="new">Newest first</option>
          <option value="amount">Highest amount</option>
        </select>
        <button onClick={onNew} style={{ border: "none", background: "#2f6bed", color: "#fff", fontWeight: 800, fontSize: 13, padding: "10px 16px", borderRadius: 10, cursor: "pointer", boxShadow: "0 3px 10px rgba(47,107,237,.28)" }}>+ Create Invoice</button>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: "6px 20px 16px", border: "1px solid #eef1f7" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>INVOICE #</th>
              <th style={th}>CUSTOMER</th>
              <th style={th}>TEMPLATE</th>
              <th style={th}>DATE</th>
              <th style={th}>STATUS</th>
              <th style={{ ...th, textAlign: "right" }}>AMOUNT</th>
              <th style={{ ...th, textAlign: "right" }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inv) => {
              const t = compTotals(inv.lines, inv.amountPaid, taxOf(inv));
              const c = stColor(inv.status);
              return (
                <tr key={inv.id}>
                  <td style={{ ...td, fontWeight: 700 }}>{inv.number}</td>
                  <td style={td}>{inv.customer?.store || "—"}</td>
                  <td style={{ ...td, color: "#7c8598", fontSize: 12.5 }}>{inv.templateName || "—"}</td>
                  <td style={{ ...td, color: "#7c8598" }}>{inv.date}</td>
                  <td style={td}>
                    <select
                      value={inv.status}
                      onChange={(e) => onStatus(inv, e.target.value as InvoiceStatus)}
                      style={{ border: "none", background: c.bg, color: c.fg, fontWeight: 700, fontSize: 11, padding: "5px 9px", borderRadius: 20, cursor: "pointer" }}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 800, fontFamily: "'Space Grotesk'" }}>{money(t.total, currency)}</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <Act onClick={() => onPreview(inv)} color="#5b6478">View</Act>
                    <Act onClick={() => onOpen(inv)} color="#2f6bed">Edit</Act>
                    <Act onClick={() => onDuplicate(inv)} color="#5b6478">Copy</Act>
                    <Act onClick={() => onDelete(inv)} color="#d64545">Del</Act>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "40px 0", textAlign: "center", color: "#aab2c4", fontWeight: 600, fontSize: 13 }}>
                  No invoices match. {invoices.length === 0 ? "Create your first one." : "Try clearing filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 11.5, color: "#9aa3b5", fontWeight: 600 }}>
        {rows.length} of {invoices.length} invoices
      </div>
    </div>
  );
}

function Act({ children, onClick, color }: { children: React.ReactNode; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} style={{ border: "1px solid #e8ecf3", background: "#fff", color, fontWeight: 700, fontSize: 11.5, padding: "5px 9px", borderRadius: 7, cursor: "pointer", marginLeft: 5 }}>
      {children}
    </button>
  );
}
