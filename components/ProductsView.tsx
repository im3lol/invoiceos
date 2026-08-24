"use client";

import React, { useMemo, useState } from "react";
import type { Product } from "@/lib/domain";
import { genId } from "@/lib/domain";
import { money } from "@/lib/calc";
import type { ParseResult } from "@/lib/parseProducts";
import { parseProducts } from "@/lib/parseProducts";
import { parseProductsFromFile } from "@/lib/parseExcel";

const PAGE_SIZE = 20;
type SortKey = "title" | "priceHi" | "priceLo";

export default function ProductsView({
  products,
  onAdd,
  onEdit,
  onDelete,
  onBulkSave,
}: {
  products: Product[];
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onBulkSave: (list: Product[]) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("title");
  const [discountedOnly, setDiscountedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [bulkOpen, setBulkOpen] = useState(false);

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
        <button onClick={() => setBulkOpen(true)} style={{ border: "1px solid #e2e8f5", background: "#fff", color: "#1e2433", fontWeight: 800, fontSize: 12.5, padding: "10px 14px", borderRadius: 10, cursor: "pointer" }}>Bulk add</button>
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
                <td style={{ ...td, textAlign: "right", fontWeight: 800, fontFamily: "'Space Grotesk'" }}>{money(p.unitPrice)}</td>
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

      {bulkOpen && <BulkAdd products={products} onClose={() => setBulkOpen(false)} onSave={onBulkSave} />}
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

/* ---------- bulk add ---------- *
 * Paste rows straight out of Excel/Sheets (tabs) or a CSV. Rows that match an
 * existing barcode/SKU update that product instead of creating a duplicate. */
function BulkAdd({ products, onClose, onSave }: { products: Product[]; onClose: () => void; onSave: (list: Product[]) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // A file and the paste box are mutually exclusive sources — picking one
  // clears the other's result so there's never a question of which "wins".
  const [fileResult, setFileResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState("");

  const textResult = useMemo(() => (text.trim() ? parseProducts(text) : null), [text]);
  const parsed = fileResult || textResult;

  const onTextChange = (v: string) => {
    setText(v);
    if (v.trim()) { setFileResult(null); setFileName(""); setFileError(""); }
  };
  const onFilePicked = async (file: File | undefined) => {
    if (!file) return;
    setText("");
    setFileName(file.name);
    setFileError("");
    setFileBusy(true);
    try {
      setFileResult(await parseProductsFromFile(file));
    } catch (e) {
      setFileResult(null);
      setFileError("Couldn't read that file — " + (e as Error).message);
    } finally {
      setFileBusy(false);
    }
  };

  // Match on barcode first, then SKU — either one identifies an existing product.
  const existing = useMemo(() => {
    const byKey = new Map<string, Product>();
    products.forEach((p) => {
      if (p.asin) byKey.set("a:" + p.asin.toLowerCase(), p);
      if (p.sku) byKey.set("s:" + p.sku.toLowerCase(), p);
    });
    return byKey;
  }, [products]);
  const matchOf = (p: { asin: string; sku: string }) =>
    (p.asin && existing.get("a:" + p.asin.toLowerCase())) || (p.sku && existing.get("s:" + p.sku.toLowerCase())) || null;

  const rows = parsed?.rows || [];
  const errors = parsed?.errors || [];
  const updates = rows.filter((r) => matchOf(r.product)).length;
  const adds = rows.length - updates;

  const save = async () => {
    setBusy(true);
    try {
      await onSave(rows.map((r) => ({ ...r.product, id: matchOf(r.product)?.id || genId("p") })));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const preview = rows.slice(0, 8);
  const hidden = rows.length - preview.length;
  return (
    <div className="no-print" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,28,50,.42)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20, animation: "fadein .2s ease" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 24, width: 720, maxHeight: "88vh", overflow: "auto", animation: "popin .25s ease", boxShadow: "0 24px 60px rgba(20,30,60,.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Bulk add products</div>
          <button onClick={onClose} style={{ border: "none", background: "#f4f6fb", color: "#7c8598", fontWeight: 800, width: 30, height: 30, borderRadius: 8, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: "#7c8598", fontWeight: 600, marginBottom: 12, lineHeight: 1.6 }}>
          Upload an Excel file, or copy rows out of Excel/Sheets and paste them below. Column order:{" "}
          <b>title · barcode · SKU · unit price · discount %</b>. A header row is ignored, and a row matching an existing barcode or SKU updates that product.
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 7, border: "1px solid #2f6bed", background: "#eef4fe", color: "#2f6bed", fontWeight: 800, fontSize: 12.5, padding: "9px 14px", borderRadius: 9, cursor: "pointer" }}>
            {fileBusy ? "Reading…" : "Upload .xlsx / .csv"}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onFilePicked(e.target.files?.[0])} disabled={fileBusy} style={{ display: "none" }} />
          </label>
          {fileName && !fileBusy && <span style={{ fontSize: 12, color: "#5b6478", fontWeight: 600 }}>{fileName}</span>}
        </div>
        {fileError && <div style={{ fontSize: 12, color: "#d64545", fontWeight: 700, marginBottom: 10 }}>{fileError}</div>}

        <div style={{ fontSize: 11, color: "#aab2c4", fontWeight: 700, textAlign: "center", margin: "2px 0 10px" }}>— or paste rows —</div>

        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={9}
          spellCheck={false}
          placeholder={"Wireless Earbuds Pro\tB09ABC1234\tWEP-001\t79.99\t0\nLED Desk Lamp\tB08JKL3456\tLDL-10\t39.99\t10"}
          style={{ width: "100%", border: "1px solid #e2e8f5", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, fontFamily: "'Space Grotesk', monospace", lineHeight: 1.6, resize: "vertical" }}
        />

        {parsed && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>
              {adds} to add
              {updates > 0 && <span style={{ color: "#2f6bed" }}> · {updates} to update</span>}
              {errors.length > 0 && <span style={{ color: "#d64545" }}> · {errors.length} skipped</span>}
            </div>

            {errors.length > 0 && (
              <div style={{ background: "#fdf4f4", border: "1px solid #f6dfe0", borderRadius: 10, padding: "9px 12px", marginBottom: 10, maxHeight: 110, overflow: "auto" }}>
                {errors.map((e) => (
                  <div key={e.line} style={{ fontSize: 11.5, color: "#d64545", fontWeight: 600 }}>Row {e.line}: {e.msg}</div>
                ))}
              </div>
            )}

            {preview.length > 0 && (
              <div style={{ border: "1px solid #eef1f7", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f7faff" }}>
                      {["TITLE", "BARCODE", "SKU", "PRICE", "DISC %", ""].map((h, i) => (
                        <th key={i} style={{ fontSize: 10, color: "#9aa3b5", fontWeight: 700, padding: "7px 8px", textAlign: i > 2 ? "right" : "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r) => {
                      const hit = matchOf(r.product);
                      return (
                        <tr key={r.line}>
                          <td style={{ ...bcell, fontWeight: 700 }}>{r.product.title}</td>
                          <td style={{ ...bcell, fontFamily: "'Space Grotesk'", color: "#2f6bed" }}>{r.product.asin || "—"}</td>
                          <td style={{ ...bcell, color: "#9aa3b5" }}>{r.product.sku || "—"}</td>
                          <td style={{ ...bcell, textAlign: "right", fontWeight: 700 }}>{money(r.product.unitPrice)}</td>
                          <td style={{ ...bcell, textAlign: "right" }}>{r.product.discountPct}%</td>
                          <td style={{ ...bcell, textAlign: "right", fontSize: 10, fontWeight: 800, color: hit ? "#2f6bed" : "#1f9d63" }}>{hit ? "UPDATE" : "NEW"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {hidden > 0 && <div style={{ padding: "7px 10px", fontSize: 11, color: "#9aa3b5", fontWeight: 600, background: "#fbfcfe" }}>+ {hidden} more</div>}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button
            onClick={save}
            disabled={busy || rows.length === 0}
            style={{ flex: 1, border: "none", background: "#2f6bed", color: "#fff", fontWeight: 800, fontSize: 13.5, padding: 12, borderRadius: 10, cursor: rows.length ? "pointer" : "default", opacity: busy || rows.length === 0 ? 0.5 : 1 }}
          >
            {busy ? "Importing…" : rows.length > 0 ? "Import " + rows.length : "Import"}
          </button>
          <button onClick={onClose} style={{ border: "1px solid #e2e8f5", background: "#fff", color: "#1e2433", fontWeight: 800, fontSize: 13.5, padding: "12px 18px", borderRadius: 10, cursor: "pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const bcell: React.CSSProperties = { fontSize: 11.5, padding: "7px 8px", borderTop: "1px solid #f4f6fb" };
