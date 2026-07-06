"use client";

import React, { useMemo, useState } from "react";
import type { Product } from "@/lib/domain";
import { money } from "@/lib/calc";

const PAGE_SIZE = 20;
type SortKey = "title" | "priceHi" | "priceLo";

export default function ProductsView({
  products,
  currency,
  onAdd,
  onEdit,
  onDelete,
}: {
  products: Product[];
  currency: string;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("title");
  const [discountedOnly, setDiscountedOnly] = useState(false);
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let list = products.filter((p) => {
      if (discountedOnly && !(+p.discountPct > 0)) return false;
      if (!ql) return true;
      return (p.title + " " + p.asin + " " + p.sku).toLowerCase().includes(ql);
    });
    if (sort === "title") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "priceHi") list = [...list].sort((a, b) => (+b.unitPrice || 0) - (+a.unitPrice || 0));
    else if (sort === "priceLo") list = [...list].sort((a, b) => (+a.unitPrice || 0) - (+b.unitPrice || 0));
    return list;
  }, [products, q, sort, discountedOnly]);

  // Clamp the page whenever the filtered result set shrinks below the current page.
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  // Any filter change should send the user back to the first page.
  const resetPage = () => setPage(1);

  const th: React.CSSProperties = { fontSize: 11, color: "#9aa3b5", fontWeight: 700, padding: "14px 6px 10px", borderBottom: "1px solid #eef1f7", textAlign: "left" };
  const td: React.CSSProperties = { padding: "12px 6px", borderBottom: "1px solid #f4f6fb", fontSize: 13 };

  return (
    <div style={{ animation: "fadein .3s ease" }}>
      {/* filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); resetPage(); }}
          placeholder="Search title, barcode or SKU…"
          style={{ flex: 1, minWidth: 220, padding: "10px 12px", border: "1px solid #e2e8f5", borderRadius: 10, fontSize: 13, fontWeight: 600, background: "#fff" }}
        />
        <button
          onClick={() => { setDiscountedOnly((v) => !v); resetPage(); }}
          style={{ border: "1px solid " + (discountedOnly ? "#2f6bed" : "#e2e8f5"), background: discountedOnly ? "#2f6bed" : "#fff", color: discountedOnly ? "#fff" : "#5b6478", fontWeight: 700, fontSize: 12, padding: "9px 13px", borderRadius: 10, cursor: "pointer" }}
        >
          Discounted only
        </button>
        <select value={sort} onChange={(e) => { setSort(e.target.value as SortKey); resetPage(); }} style={{ border: "1px solid #e2e8f5", borderRadius: 10, padding: "9px 10px", fontSize: 12.5, fontWeight: 700, background: "#fff" }}>
          <option value="title">Title A–Z</option>
          <option value="priceHi">Price: high → low</option>
          <option value="priceLo">Price: low → high</option>
        </select>
        <button onClick={onAdd} style={{ border: "none", background: "#2f6bed", color: "#fff", fontWeight: 800, fontSize: 13, padding: "10px 16px", borderRadius: 10, cursor: "pointer", boxShadow: "0 3px 10px rgba(47,107,237,.28)" }}>+ Add Product</button>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: "6px 22px 16px", border: "1px solid #eef1f7" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>PRODUCT TITLE</th>
              <th style={th}>BARCODE / SKU</th>
              <th style={{ ...th, textAlign: "right" }}>UNIT PRICE</th>
              <th style={{ ...th, textAlign: "right" }}>DISC %</th>
              <th style={{ ...th, textAlign: "right" }}></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((p) => (
              <tr key={p.id}>
                <td style={{ ...td, fontWeight: 700 }}>{p.title}</td>
                <td style={{ ...td, fontSize: 12.5 }}>
                  <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 600, color: "#2f6bed" }}>{p.asin}</span> <span style={{ color: "#9aa3b5" }}>/ {p.sku}</span>
                </td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800, fontFamily: "'Space Grotesk'" }}>{money(p.unitPrice, currency)}</td>
                <td style={{ ...td, textAlign: "right" }}>{p.discountPct}%</td>
                <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                  <Act onClick={() => onEdit(p.id)} color="#5b6478">Edit</Act>
                  <Act onClick={() => onDelete(p.id)} color="#d64545">Delete</Act>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "40px 0", textAlign: "center", color: "#aab2c4", fontWeight: 600, fontSize: 13 }}>
                  No products match. {products.length === 0 ? "Add your first one." : "Try clearing filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* footer: count + pagination */}
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11.5, color: "#9aa3b5", fontWeight: 600 }}>
          {rows.length === 0 ? "0" : `${start + 1}–${start + pageRows.length}`} of {rows.length}
          {rows.length !== products.length ? ` (filtered from ${products.length})` : ""}
        </div>
        {pageCount > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <PageBtn disabled={current <= 1} onClick={() => setPage(current - 1)}>‹ Prev</PageBtn>
            {pageNumbers(current, pageCount).map((n, i) =>
              n === "…" ? (
                <span key={"g" + i} style={{ padding: "0 4px", color: "#aab2c4", fontWeight: 700, fontSize: 12.5 }}>…</span>
              ) : (
                <button
                  key={n}
                  onClick={() => setPage(n as number)}
                  style={{ minWidth: 32, border: "1px solid " + (n === current ? "#2f6bed" : "#e2e8f5"), background: n === current ? "#2f6bed" : "#fff", color: n === current ? "#fff" : "#5b6478", fontWeight: 700, fontSize: 12.5, padding: "6px 9px", borderRadius: 8, cursor: "pointer" }}
                >
                  {n}
                </button>
              )
            )}
            <PageBtn disabled={current >= pageCount} onClick={() => setPage(current + 1)}>Next ›</PageBtn>
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact page list with ellipses, e.g. 1 … 4 5 6 … 12. */
function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const lo = Math.max(2, current - 1);
  const hi = Math.min(total - 1, current + 1);
  if (lo > 2) out.push("…");
  for (let n = lo; n <= hi; n++) out.push(n);
  if (hi < total - 1) out.push("…");
  out.push(total);
  return out;
}

function PageBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ border: "1px solid #e2e8f5", background: "#fff", color: "#5b6478", fontWeight: 700, fontSize: 12.5, padding: "6px 10px", borderRadius: 8, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1 }}
    >
      {children}
    </button>
  );
}

function Act({ children, onClick, color }: { children: React.ReactNode; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} style={{ border: "1px solid #e8ecf3", background: "#fff", color, fontWeight: 700, fontSize: 11.5, padding: "5px 9px", borderRadius: 7, cursor: "pointer", marginLeft: 5 }}>
      {children}
    </button>
  );
}
