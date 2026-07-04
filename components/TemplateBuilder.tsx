"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Align,
  Block,
  BlockType,
  COL_FIELDS,
  ColField,
  Column,
  MetaRow,
  PALETTE,
  TableRow,
  TemplateDoc,
  TemplateRecord,
  TotalRow,
  defaultDoc,
  fontFamily,
  makeBlock,
  uid,
} from "@/lib/templateTypes";
import { deleteTemplate, listTemplates, saveTemplate, setPublished, usingSupabase } from "@/lib/templatesApi";

type DragPayload = { kind: "add"; type: BlockType } | { kind: "move"; id: string } | null;

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

type Props = Record<string, unknown>;
/** A patch is either a partial merge, or a recipe computing the next props
 * from the latest props (needed so same-tick edits never use stale arrays). */
type Patch = Props | ((prev: Props) => Props);

interface Hist {
  doc: TemplateDoc;
  past: TemplateDoc[];
  future: TemplateDoc[];
}

export default function TemplateBuilder() {
  // Single atomic history state so rapid/back-to-back edits never clobber each
  // other (functional updates always read the latest doc, not a stale closure).
  const [hist, setHist] = useState<Hist>(() => ({ doc: defaultDoc(), past: [], future: [] }));
  const doc = hist.doc;
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [flash, setFlash] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeZone, setActiveZone] = useState<number | null>(null);
  // "gallery" = landing grid of saved templates; "editor" = the drag-drop canvas.
  const [mode, setMode] = useState<"gallery" | "editor">("gallery");

  const dragRef = useRef<DragPayload>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(""), 2600);
  }, []);

  /* ---------- history (atomic, functional) ---------- */
  const commit = useCallback((recipe: (prev: TemplateDoc) => TemplateDoc) => {
    setHist((h) => ({ doc: recipe(h.doc), past: [...h.past.slice(-49), h.doc], future: [] }));
  }, []);
  const undo = useCallback(() => {
    setHist((h) => (h.past.length ? { doc: h.past[h.past.length - 1], past: h.past.slice(0, -1), future: [h.doc, ...h.future] } : h));
  }, []);
  const redo = useCallback(() => {
    setHist((h) => (h.future.length ? { doc: h.future[0], past: [...h.past, h.doc], future: h.future.slice(1) } : h));
  }, []);
  /** Change without adding a history entry (e.g. per-keystroke name edits). */
  const setDocNoHistory = useCallback((recipe: (prev: TemplateDoc) => TemplateDoc) => {
    setHist((h) => ({ ...h, doc: recipe(h.doc) }));
  }, []);

  /* ---------- block mutations ---------- */
  const patchBlock = useCallback(
    (id: string, patch: Patch) => {
      commit((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => (b.id === id ? { ...b, props: typeof patch === "function" ? patch(b.props) : { ...b.props, ...patch } } : b)),
      }));
    },
    [commit],
  );
  const insertBlock = useCallback(
    (type: BlockType, index: number) => {
      const nb = makeBlock(type);
      commit((prev) => {
        const blocks = [...prev.blocks];
        blocks.splice(index, 0, nb);
        return { ...prev, blocks };
      });
      setSelectedId(nb.id);
    },
    [commit],
  );
  const moveBlock = useCallback(
    (id: string, targetIndex: number) => {
      commit((prev) => {
        const from = prev.blocks.findIndex((b) => b.id === id);
        if (from < 0) return prev;
        const blocks = [...prev.blocks];
        const [m] = blocks.splice(from, 1);
        const idx = from < targetIndex ? targetIndex - 1 : targetIndex;
        blocks.splice(idx, 0, m);
        return { ...prev, blocks };
      });
    },
    [commit],
  );
  const removeBlock = useCallback(
    (id: string) => {
      commit((prev) => ({ ...prev, blocks: prev.blocks.filter((b) => b.id !== id) }));
      setSelectedId(null);
    },
    [commit],
  );
  const duplicateBlock = useCallback(
    (id: string) => {
      commit((prev) => {
        const i = prev.blocks.findIndex((b) => b.id === id);
        if (i < 0) return prev;
        const copy = clone(prev.blocks[i]);
        copy.id = uid();
        if (copy.type === "productTable") {
          (copy.props.rows as TableRow[]).forEach((r) => (r.id = uid("r")));
        }
        const blocks = [...prev.blocks];
        blocks.splice(i + 1, 0, copy);
        return { ...prev, blocks };
      });
    },
    [commit],
  );
  const setPage = useCallback(
    (patch: Partial<TemplateDoc["page"]>) => commit((prev) => ({ ...prev, page: { ...prev.page, ...patch } })),
    [commit],
  );

  /* ---------- persistence ---------- */
  const refreshTemplates = useCallback(async () => {
    try {
      setTemplates(await listTemplates());
    } catch (e) {
      console.error(e);
    }
  }, []);
  useEffect(() => {
    refreshTemplates();
  }, [refreshTemplates]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const rec = await saveTemplate(doc.name || "Untitled Template", doc, currentId);
      setCurrentId(rec.id);
      showFlash("“" + rec.name + "” saved ✓");
      await refreshTemplates();
    } catch (e) {
      console.error(e);
      showFlash("Save failed — " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [doc, currentId, showFlash, refreshTemplates]);

  const publish = useCallback(async () => {
    if (!currentId) {
      showFlash("Save the template first, then publish.");
      return;
    }
    try {
      await setPublished(currentId, true);
      showFlash("Published ✓ — available to the invoice generator");
      await refreshTemplates();
    } catch (e) {
      showFlash("Publish failed — " + (e as Error).message);
    }
  }, [currentId, showFlash, refreshTemplates]);

  const loadTemplate = useCallback((rec: TemplateRecord) => {
    setHist({ doc: clone(rec.doc), past: [], future: [] });
    setCurrentId(rec.id);
    setSelectedId(null);
    setMode("editor");
  }, []);

  const newTemplate = useCallback(() => {
    setHist({ doc: defaultDoc(), past: [], future: [] });
    setCurrentId(null);
    setSelectedId(null);
    setMode("editor");
  }, []);

  // Return to the gallery, refreshing the list so it reflects the latest saves.
  const backToGallery = useCallback(() => {
    setMode("gallery");
    setSelectedId(null);
    refreshTemplates();
  }, [refreshTemplates]);

  const removeTemplate = useCallback(
    async (rec: TemplateRecord) => {
      try {
        await deleteTemplate(rec.id);
        if (rec.id === currentId) newTemplate();
        await refreshTemplates();
      } catch (e) {
        showFlash("Delete failed — " + (e as Error).message);
      }
    },
    [currentId, newTemplate, refreshTemplates, showFlash],
  );

  /* ---------- drag & drop ---------- */
  const onZoneDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const p = dragRef.current;
    setActiveZone(null);
    dragRef.current = null;
    if (!p) return;
    if (p.kind === "add") insertBlock(p.type, index);
    else moveBlock(p.id, index);
  };
  const onZoneOver = (index: number) => (e: React.DragEvent) => {
    if (!dragRef.current) return;
    e.preventDefault();
    setActiveZone(index);
  };

  const canUndo = hist.past.length > 0;
  const canRedo = hist.future.length > 0;

  /* ================= Gallery (landing) ================= */
  if (mode === "gallery") {
    const galleryCard: React.CSSProperties = { background: "#fff", border: "1px solid #eef1f7", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 10px rgba(20,30,60,.04)" };
    return (
      <div style={{ animation: "fadein .3s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Your Templates</div>
            <div style={{ fontSize: 12.5, color: "#9aa3b5", fontWeight: 600 }}>
              {templates.length} saved · click a template to edit, or start a new one
            </div>
          </div>
          <button onClick={newTemplate} style={primaryBtn}>＋ New Template</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16 }}>
          {/* New-template tile */}
          <button
            onClick={newTemplate}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 250, border: "2px dashed #cbd6ee", borderRadius: 14, background: "#f8faff", cursor: "pointer" }}
          >
            <div style={{ fontSize: 34, color: "#2f6bed", lineHeight: 1 }}>＋</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#2f6bed" }}>New Template</div>
            <div style={{ fontSize: 11, color: "#9aa3b5", fontWeight: 600 }}>Start from a blank A4 page</div>
          </button>

          {templates.map((t) => (
            <div key={t.id} style={galleryCard}>
              <div onClick={() => loadTemplate(t)} style={{ cursor: "pointer", height: 200, overflow: "hidden", background: "#f4f7fd", borderBottom: "1px solid #eef1f7", position: "relative" }}>
                <div style={{ transform: "scale(.34)", transformOrigin: "top left", width: 640, pointerEvents: "none" }}>
                  <PreviewPaper doc={t.doc} />
                </div>
                {t.published && <span style={{ position: "absolute", top: 8, right: 8, fontSize: 9, color: "#1f9d63", fontWeight: 800, background: "#e5f6ec", padding: "2px 7px", borderRadius: 20 }}>● LIVE</span>}
              </div>
              <div style={{ padding: "11px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div onClick={() => loadTemplate(t)} style={{ cursor: "pointer", minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                  <div style={{ fontSize: 10.5, color: "#9aa3b5", fontWeight: 600 }}>{(t.doc?.blocks?.length ?? 0)} blocks{t.published ? " · live" : " · draft"}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
                  <button onClick={() => loadTemplate(t)} style={{ border: "1px solid #dfe7f8", background: "#eef4fe", color: "#2f6bed", fontWeight: 800, fontSize: 11.5, padding: "6px 11px", borderRadius: 8, cursor: "pointer" }}>Edit</button>
                  <button onClick={() => removeTemplate(t)} title="Delete" style={{ border: "1px solid #f6dfe0", background: "#fff", color: "#d64545", fontWeight: 800, width: 30, height: 30, borderRadius: 8, cursor: "pointer" }}>×</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <span style={{ display: "block", marginTop: 16, fontSize: 11, color: usingSupabase ? "#1f9d63" : "#e0912f", fontWeight: 700 }}>
          {usingSupabase ? "● Saving to Supabase" : "● Local only — Supabase not configured"}
        </span>
      </div>
    );
  }

  /* ================= Editor ================= */
  return (
    <div style={{ animation: "fadein .3s ease" }}>
      {/* ---------------- Toolbar ---------------- */}
      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#fff",
          border: "1px solid #eef1f7",
          borderRadius: 14,
          padding: "10px 14px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={backToGallery} style={{ ...ghostBtn, fontWeight: 800 }} title="Back to templates">← Templates</button>
          <div style={{ width: 1, height: 22, background: "#eef1f7", margin: "0 6px" }} />
          <TBtn onClick={undo} disabled={!canUndo} title="Undo">↺</TBtn>
          <TBtn onClick={redo} disabled={!canRedo} title="Redo">↻</TBtn>
          <div style={{ width: 1, height: 22, background: "#eef1f7", margin: "0 6px" }} />
          <input
            value={doc.name}
            onChange={(e) => setDocNoHistory((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Template name"
            style={{
              border: "1px solid #eef1f7",
              borderRadius: 8,
              padding: "8px 11px",
              fontSize: 13.5,
              fontWeight: 800,
              width: 220,
            }}
          />
          <span style={{ fontSize: 11, color: usingSupabase ? "#1f9d63" : "#e0912f", fontWeight: 700 }}>
            {usingSupabase ? "● Supabase" : "● Local"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11.5, color: "#1f9d63", fontWeight: 700, minWidth: 10 }}>{flash}</span>
          <button onClick={() => setPreviewOpen(true)} style={ghostBtn}>Preview</button>
          <button onClick={newTemplate} style={ghostBtn}>New</button>
          <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save Template"}
          </button>
          <button onClick={publish} style={{ ...primaryBtn, background: "#1f2937" }}>Publish</button>
        </div>
      </div>

      {/* ---------------- 3-pane builder ---------------- */}
      <div style={{ display: "grid", gridTemplateColumns: "210px 1fr 340px", gap: 16, alignItems: "start" }}>
        {/* palette */}
        <div className="no-print" style={paneCard}>
          <div style={paneLabel}>ELEMENTS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PALETTE.map((p) => (
              <div
                key={p.type}
                draggable
                onDragStart={() => (dragRef.current = { kind: "add", type: p.type })}
                onDragEnd={() => {
                  dragRef.current = null;
                  setActiveZone(null);
                }}
                onDoubleClick={() => insertBlock(p.type, doc.blocks.length)}
                title="Drag onto the canvas (or double-click to append)"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "9px 10px",
                  border: "1px solid #e6ebf5",
                  borderRadius: 10,
                  cursor: "grab",
                  background: "#fbfcfe",
                }}
              >
                <div style={paletteIcon}>{p.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.2 }}>{p.label}</div>
                  <div style={{ fontSize: 10, color: "#9aa3b5", fontWeight: 600 }}>{p.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* canvas */}
        <div className="no-print" style={{ background: "#eef2f9", borderRadius: 16, padding: 20, border: "1px solid #e2e8f5", minHeight: 500 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#9aa3b5", fontWeight: 700, letterSpacing: ".4px" }}>
              CANVAS — DRAG ELEMENTS IN · DRAG BLOCKS TO REORDER
            </div>
            <div style={{ fontSize: 11, color: "#9aa3b5", fontWeight: 700 }}>A4</div>
          </div>

          {/* the editable A4 page */}
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              boxShadow: "0 8px 30px rgba(20,30,60,.10)",
              padding: doc.page.margin,
              fontFamily: fontFamily(doc.page.font),
              maxWidth: 820,
              margin: "0 auto",
            }}
          >
            <DropZone active={activeZone === 0} onOver={onZoneOver(0)} onDrop={onZoneDrop(0)} first />
            {doc.blocks.map((b, i) => (
              <React.Fragment key={b.id}>
                <BlockCard
                  block={b}
                  page={doc.page}
                  selected={selectedId === b.id}
                  onSelect={() => setSelectedId(b.id)}
                  onDragStart={() => (dragRef.current = { kind: "move", id: b.id })}
                  onDragEnd={() => {
                    dragRef.current = null;
                    setActiveZone(null);
                  }}
                  onPatch={(patch) => patchBlock(b.id, patch)}
                  onRemove={() => removeBlock(b.id)}
                  onDuplicate={() => duplicateBlock(b.id)}
                />
                <DropZone active={activeZone === i + 1} onOver={onZoneOver(i + 1)} onDrop={onZoneDrop(i + 1)} />
              </React.Fragment>
            ))}
            {doc.blocks.length === 0 && (
              <div style={{ textAlign: "center", color: "#aab2c4", fontSize: 13, fontWeight: 600, padding: "40px 0" }}>
                Drag an element here to begin.
              </div>
            )}
          </div>
        </div>

        {/* right: styles + live preview + saved */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="no-print" style={paneCard}>
            <div style={paneLabel}>PAGE STYLE</div>
            <StyleRow label="Primary">
              <ColorInput value={doc.page.primary} onChange={(v) => setPage({ primary: v })} />
            </StyleRow>
            <StyleRow label="Accent">
              <ColorInput value={doc.page.accent} onChange={(v) => setPage({ accent: v })} />
            </StyleRow>
            <StyleRow label="Font">
              <select value={doc.page.font} onChange={(e) => setPage({ font: e.target.value })} style={miniSelect}>
                <option value="Manrope">Manrope</option>
                <option value="Space Grotesk">Space Grotesk</option>
                <option value="Georgia">Georgia</option>
              </select>
            </StyleRow>
            <StyleRow label={`Margin ${doc.page.margin}px`}>
              <input
                type="range"
                min={24}
                max={72}
                step={2}
                value={doc.page.margin}
                onChange={(e) => setPage({ margin: +e.target.value })}
                style={{ width: 130, accentColor: "#2f6bed" }}
              />
            </StyleRow>
          </div>

          <div style={paneCard}>
            <div className="no-print" style={paneLabel}>LIVE PREVIEW</div>
            <div style={{ overflow: "auto", background: "#f4f7fd", borderRadius: 10, padding: 12 }}>
              <div style={{ transform: "scale(.5)", transformOrigin: "top left", width: 640, height: 905 }}>
                <PreviewPaper doc={doc} />
              </div>
            </div>
          </div>

          <div className="no-print" style={paneCard}>
            <div style={paneLabel}>SAVED TEMPLATES {templates.length ? `(${templates.length})` : ""}</div>
            {templates.length === 0 && <div style={{ fontSize: 11.5, color: "#aab2c4", fontWeight: 600 }}>None yet — hit Save Template.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {templates.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    border: "1px solid #eef1f7",
                    borderRadius: 9,
                    background: t.id === currentId ? "#eef4fe" : "#fff",
                  }}
                >
                  <div onClick={() => loadTemplate(t)} style={{ cursor: "pointer", minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
                      {t.name}
                      {t.published && <span style={{ fontSize: 9, color: "#1f9d63", fontWeight: 800, background: "#e5f6ec", padding: "1px 6px", borderRadius: 20 }}>LIVE</span>}
                    </div>
                    <div style={{ fontSize: 10, color: "#9aa3b5", fontWeight: 600 }}>{(t.doc?.blocks?.length ?? 0)} blocks</div>
                  </div>
                  <button onClick={() => removeTemplate(t)} title="Delete" style={{ border: "1px solid #f6dfe0", background: "#fff", color: "#d64545", fontWeight: 800, width: 24, height: 24, borderRadius: 7, cursor: "pointer" }}>×</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- Preview modal ---------------- */}
      {previewOpen && (
        <div
          className="no-print"
          onClick={() => setPreviewOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(20,28,50,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 60, padding: 30, overflow: "auto" }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => window.print()} style={primaryBtn}>Print / PDF</button>
              <button onClick={() => setPreviewOpen(false)} style={{ ...ghostBtn, background: "#fff" }}>Close</button>
            </div>
            <div className="print-area">
              <PreviewPaper doc={doc} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== *
 * Canvas block card (edit mode)
 * ================================================================== */
function BlockCard(props: {
  block: Block;
  page: TemplateDoc["page"];
  selected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onPatch: (patch: Patch) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const { block, selected, onSelect, onDragStart, onDragEnd, onPatch, onRemove, onDuplicate } = props;
  return (
    <div
      onMouseDown={onSelect}
      style={{
        position: "relative",
        border: selected ? "2px solid #2f6bed" : "2px dashed transparent",
        borderRadius: 10,
        padding: 8,
        margin: "2px 0",
        background: selected ? "rgba(47,107,237,.03)" : "transparent",
        transition: "border-color .15s",
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget.style.borderColor = "#d5deee");
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget.style.borderColor = "transparent");
      }}
    >
      {/* block controls */}
      <div style={{ position: "absolute", top: -12, right: 6, display: "flex", gap: 4, zIndex: 5 }}>
        <span
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
          style={ctrlBtn("grab")}
        >
          ⠿
        </span>
        <span onClick={onDuplicate} title="Duplicate" style={ctrlBtn("pointer")}>⧉</span>
        <span onClick={onRemove} title="Remove" style={{ ...ctrlBtn("pointer"), color: "#d64545" }}>×</span>
      </div>
      <EditBody block={block} onPatch={onPatch} />
    </div>
  );
}

/* per-type edit UI */
function EditBody({ block, onPatch }: { block: Block; onPatch: (p: Patch) => void }) {
  const p = block.props as Record<string, unknown>;
  switch (block.type) {
    case "header":
      return (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            {(p.showLogo as boolean) && (
              <input value={p.logoText as string} onChange={(e) => onPatch({ logoText: e.target.value })} style={{ ...cellInput, width: 46, height: 46, textAlign: "center", fontWeight: 800, background: "#fef3c7", border: "1px solid #f4d78a", borderRadius: 8 }} />
            )}
            <div>
              <Inline value={p.supplierName as string} onChange={(v) => onPatch({ supplierName: v })} bold size={15} placeholder="Company name" />
              <Area value={p.supplierLines as string} onChange={(v) => onPatch({ supplierLines: v })} size={11} color="#8a93a6" />
            </div>
          </div>
          <div style={{ textAlign: "right", minWidth: 170 }}>
            <Inline value={p.title as string} onChange={(v) => onPatch({ title: v })} bold size={18} align="right" placeholder="TAX INVOICE" />
            <MetaEditor rows={p.metaRows as MetaRow[]} onMutate={(recipe) => onPatch((prev) => ({ ...prev, metaRows: recipe((prev.metaRows as MetaRow[]) || []) }))} />
          </div>
        </div>
      );
    case "addressPair":
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {(["left", "right"] as const).map((side) => (
            <div key={side}>
              <Inline value={p[side + "Label"] as string} onChange={(v) => onPatch({ [side + "Label"]: v })} bold size={10} upper color="#8a93a6" />
              <Inline value={p[side + "Name"] as string} onChange={(v) => onPatch({ [side + "Name"]: v })} bold size={13} />
              <Area value={p[side + "Lines"] as string} onChange={(v) => onPatch({ [side + "Lines"]: v })} size={11} color="#5b6478" />
            </div>
          ))}
        </div>
      );
    case "productTable":
      return <TableEditor columns={p.columns as Column[]} rows={p.rows as TableRow[]} onPatch={onPatch} />;
    case "totals":
      return <TotalsEditor block={block} onPatch={onPatch} />;
    case "logo":
      return (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <input value={p.logoText as string} onChange={(e) => onPatch({ logoText: e.target.value })} style={{ width: (p.size as number) || 54, height: (p.size as number) || 54, textAlign: "center", fontWeight: 800, fontSize: 20, background: "#eef3fd", color: "#2f6bed", border: "1px solid #cfe0fb", borderRadius: 10 }} />
        </div>
      );
    case "heading":
      return <Inline value={p.text as string} onChange={(v) => onPatch({ text: v })} bold size={(p.size as number) || 18} align={(p.align as Align) || "left"} />;
    case "text":
      return <Area value={p.text as string} onChange={(v) => onPatch({ text: v })} size={(p.size as number) || 12} color={(p.color as string) || "#5b6478"} />;
    case "divider":
      return <div style={{ height: 1, background: (p.color as string) || "#e8ecf3", margin: "6px 0" }} />;
    case "spacer":
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#c2cbdd", fontSize: 11, fontWeight: 700 }}>
          <span>SPACER</span>
          <input type="range" min={8} max={80} value={(p.height as number) || 24} onChange={(e) => onPatch({ height: +e.target.value })} style={{ accentColor: "#2f6bed" }} />
          <span>{(p.height as number) || 24}px</span>
        </div>
      );
    default:
      return null;
  }
}

/* ---------- product table editor ---------- */
function TableEditor({ columns, rows, onPatch }: { columns: Column[]; rows: TableRow[]; onPatch: (p: Patch) => void }) {
  // All mutations read prev props inside the patch so same-tick edits compose.
  const cols = (p: Props) => (p.columns as Column[]) || [];
  const rws = (p: Props) => (p.rows as TableRow[]) || [];
  const cycleAlign = (a: Align): Align => (a === "left" ? "center" : a === "center" ? "right" : "left");
  const addColumn = () =>
    onPatch((prev) => {
      const c: Column = { id: uid("c"), label: "New", align: "left", flex: 1, field: "custom" };
      return { ...prev, columns: [...cols(prev), c], rows: rws(prev).map((r) => ({ ...r, cells: { ...r.cells, [c.id]: "" } })) };
    });
  const removeColumn = (cid: string) =>
    onPatch((prev) => ({
      ...prev,
      columns: cols(prev).filter((c) => c.id !== cid),
      rows: rws(prev).map((r) => {
        const cells = { ...r.cells };
        delete cells[cid];
        return { ...r, cells };
      }),
    }));
  const patchColumn = (cid: string, patch: Partial<Column>) => onPatch((prev) => ({ ...prev, columns: cols(prev).map((c) => (c.id === cid ? { ...c, ...patch } : c)) }));
  const addRow = () => onPatch((prev) => ({ ...prev, rows: [...rws(prev), { id: uid("r"), cells: Object.fromEntries(cols(prev).map((c) => [c.id, ""])) }] }));
  const removeRow = (rid: string) => onPatch((prev) => ({ ...prev, rows: rws(prev).filter((r) => r.id !== rid) }));
  const patchCell = (rid: string, cid: string, val: string) => onPatch((prev) => ({ ...prev, rows: rws(prev).map((r) => (r.id === rid ? { ...r, cells: { ...r.cells, [cid]: val } } : r)) }));

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.id} style={{ padding: 2, verticalAlign: "top", opacity: c.hidden ? 0.4 : 1 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <input value={c.label} onChange={(e) => patchColumn(c.id, { label: e.target.value })} style={{ ...cellInput, fontWeight: 800, fontSize: 10.5, background: "#f1f4fb", textAlign: c.align, textTransform: "uppercase" }} />
                  <select value={c.field || "custom"} onChange={(e) => patchColumn(c.id, { field: e.target.value as ColField })} title="What this column shows on the invoice" style={{ ...cellInput, fontSize: 9.5, padding: "3px", fontWeight: 700, background: "#fff" }}>
                    {COL_FIELDS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
                  </select>
                  <div style={{ display: "flex", gap: 2 }}>
                    <button onClick={() => patchColumn(c.id, { align: cycleAlign(c.align) })} title="Align" style={tinyBtn}>{c.align === "left" ? "⇤" : c.align === "center" ? "≡" : "⇥"}</button>
                    <button onClick={() => patchColumn(c.id, { hidden: !c.hidden })} title={c.hidden ? "Show on invoice" : "Hide from invoice"} style={{ ...tinyBtn, width: "auto", padding: "0 5px", fontSize: 9, color: c.hidden ? "#d64545" : "#1f9d63" }}>{c.hidden ? "Off" : "On"}</button>
                    <button onClick={() => removeColumn(c.id)} title="Remove column" style={{ ...tinyBtn, color: "#d64545" }}>×</button>
                  </div>
                </div>
              </th>
            ))}
            <th style={{ width: 30, verticalAlign: "top", padding: 2 }}>
              <button onClick={addColumn} title="Add column" style={{ ...tinyBtn, width: 26, height: 26, fontSize: 15 }}>+</button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {columns.map((c) => (
                <td key={c.id} style={{ padding: 2 }}>
                  <input value={r.cells[c.id] ?? ""} onChange={(e) => patchCell(r.id, c.id, e.target.value)} style={{ ...cellInput, textAlign: c.align }} />
                </td>
              ))}
              <td style={{ padding: 2, textAlign: "center" }}>
                <button onClick={() => removeRow(r.id)} title="Remove row" style={{ ...tinyBtn, color: "#d64545" }}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addRow} style={{ marginTop: 6, border: "1px dashed #cfe0fb", background: "#eef4fe", color: "#2f6bed", fontWeight: 800, fontSize: 11.5, padding: "5px 11px", borderRadius: 7, cursor: "pointer" }}>+ Add row</button>
    </div>
  );
}

function TotalsEditor({ block, onPatch }: { block: Block; onPatch: (p: Patch) => void }) {
  const rows = (block.props.rows as TotalRow[]) || [];
  const rws = (p: Props) => (p.rows as TotalRow[]) || [];
  const patchRow = (i: number, patch: Partial<TotalRow>) => onPatch((prev) => ({ ...prev, rows: rws(prev).map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  const addRow = () => onPatch((prev) => ({ ...prev, rows: [...rws(prev), { label: "New", value: "0.00" }] }));
  const removeRow = (i: number) => onPatch((prev) => ({ ...prev, rows: rws(prev).filter((_, idx) => idx !== i) }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 320, marginLeft: "auto" }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input value={r.label} onChange={(e) => patchRow(i, { label: e.target.value })} style={{ ...cellInput, flex: 1, fontWeight: r.strong ? 800 : 600 }} />
          <input value={r.value} onChange={(e) => patchRow(i, { value: e.target.value })} style={{ ...cellInput, width: 90, textAlign: "right", fontWeight: r.strong ? 800 : 600 }} />
          <button onClick={() => patchRow(i, { strong: !r.strong })} title="Bold" style={tinyBtn}>B</button>
          <button onClick={() => removeRow(i)} style={{ ...tinyBtn, color: "#d64545" }}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
        <button onClick={addRow} style={{ ...tinyBtn, width: "auto", padding: "0 8px" }}>+ row</button>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#5b6478", display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={!!block.props.showBalance} onChange={(e) => onPatch({ showBalance: e.target.checked })} /> Balance bar
        </label>
      </div>
      {!!block.props.showBalance && (
        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
          <input value={block.props.balanceLabel as string} onChange={(e) => onPatch({ balanceLabel: e.target.value })} style={{ ...cellInput, flex: 1, fontWeight: 800 }} />
          <input value={block.props.balanceValue as string} onChange={(e) => onPatch({ balanceValue: e.target.value })} style={{ ...cellInput, width: 110, textAlign: "right", fontWeight: 800 }} />
        </div>
      )}
    </div>
  );
}

function MetaEditor({ rows, onMutate }: { rows: MetaRow[]; onMutate: (recipe: (rows: MetaRow[]) => MetaRow[]) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
      {(rows || []).map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 3, justifyContent: "flex-end" }}>
          <input value={r.label} onChange={(e) => onMutate((rs) => rs.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))} style={{ ...cellInput, width: 78, fontSize: 10, textAlign: "right", color: "#8a93a6" }} />
          <input value={r.value} onChange={(e) => onMutate((rs) => rs.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)))} style={{ ...cellInput, width: 90, fontSize: 10.5, fontWeight: 700, textAlign: "right" }} />
          <button onClick={() => onMutate((rs) => rs.filter((_, idx) => idx !== i))} style={{ ...tinyBtn, color: "#d64545" }}>×</button>
        </div>
      ))}
      <button onClick={() => onMutate((rs) => [...(rs || []), { label: "Label", value: "Value" }])} style={{ ...tinyBtn, width: "auto", padding: "0 8px", alignSelf: "flex-end" }}>+ meta</button>
    </div>
  );
}

/* ================================================================== *
 * Read-only preview paper
 * ================================================================== */
function PreviewPaper({ doc }: { doc: TemplateDoc }) {
  const S = doc.page;
  return (
    <div
      className="invoice-paper"
      style={{
        width: 640,
        minHeight: 905,
        background: "#fff",
        boxShadow: "0 12px 40px rgba(20,30,60,.14)",
        borderRadius: 6,
        padding: S.margin,
        fontFamily: fontFamily(S.font),
        color: "#1e2433",
      }}
    >
      {doc.blocks.map((b) => (
        <PreviewBlock key={b.id} block={b} page={S} />
      ))}
    </div>
  );
}

function PreviewBlock({ block, page }: { block: Block; page: TemplateDoc["page"] }) {
  const p = block.props as Record<string, unknown>;
  const muted = "#8a93a6";
  const lines = (s: string) => (s || "").split("\n").map((l, i) => <div key={i}>{l || " "}</div>);
  switch (block.type) {
    case "header":
      return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 26 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {(p.showLogo as boolean) && (
              <div style={{ width: 50, height: 50, borderRadius: 10, background: page.accent, color: page.accentText, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18 }}>
                {p.logoText as string}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{p.supplierName as string}</div>
              <div style={{ fontSize: 11, color: muted, marginTop: 3, lineHeight: 1.5 }}>{lines(p.supplierLines as string)}</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: ".5px", color: page.primary }}>{p.title as string}</div>
            <div style={{ marginTop: 8, fontSize: 11, color: muted, lineHeight: 1.8 }}>
              {((p.metaRows as MetaRow[]) || []).map((m, i) => (
                <div key={i}>
                  {m.label} <b style={{ color: "#1e2433" }}>{m.value}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    case "addressPair":
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30, marginBottom: 24 }}>
          {(["left", "right"] as const).map((side) => (
            <div key={side}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "1px", color: muted, textTransform: "uppercase" }}>{p[side + "Label"] as string}</div>
              <div style={{ fontWeight: 800, fontSize: 14, marginTop: 6 }}>{p[side + "Name"] as string}</div>
              <div style={{ fontSize: 11.5, color: "#5b6478", marginTop: 4, lineHeight: 1.6 }}>{lines(p[side + "Lines"] as string)}</div>
            </div>
          ))}
        </div>
      );
    case "productTable": {
      const cols = ((p.columns as Column[]) || []).filter((c) => !c.hidden);
      const rows = (p.rows as TableRow[]) || [];
      const gt = cols.map((c) => c.flex + "fr").join(" ");
      return (
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: gt, background: page.primary, color: "#fff", padding: "10px 12px", borderRadius: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: ".3px" }}>
            {cols.map((c) => (
              <div key={c.id} style={{ textAlign: c.align }}>{c.label}</div>
            ))}
          </div>
          {rows.map((r) => (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: gt, padding: "11px 12px", borderBottom: "1px solid #e8ecf3", fontSize: 11.5, alignItems: "center" }}>
              {cols.map((c) => (
                <div key={c.id} style={{ textAlign: c.align, fontWeight: c.align === "left" ? 600 : 400 }}>{r.cells[c.id] || ""}</div>
              ))}
            </div>
          ))}
        </div>
      );
    }
    case "totals": {
      const rows = (p.rows as TotalRow[]) || [];
      return (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <div style={{ width: 260 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: r.strong ? 14 : 12, fontWeight: r.strong ? 800 : 500 }}>
                <span style={{ color: r.strong ? "#1e2433" : muted }}>{r.label}</span>
                <span style={{ fontWeight: r.strong ? 800 : 700, color: r.strong ? page.primary : "#1e2433" }}>{r.value}</span>
              </div>
            ))}
            {(p.showBalance as boolean) && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, padding: "9px 12px", background: page.accent, color: page.accentText, borderRadius: 6, fontSize: 12.5, fontWeight: 800 }}>
                <span>{p.balanceLabel as string}</span>
                <span>{p.balanceValue as string}</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    case "logo":
      return (
        <div style={{ display: "flex", justifyContent: "center", margin: "6px 0" }}>
          <div style={{ width: (p.size as number) || 54, height: (p.size as number) || 54, borderRadius: 12, background: page.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22 }}>
            {p.logoText as string}
          </div>
        </div>
      );
    case "heading":
      return <div style={{ fontSize: (p.size as number) || 18, fontWeight: 800, textAlign: (p.align as Align) || "left", color: (p.color as string) || "#1e2433", margin: "4px 0 8px" }}>{p.text as string}</div>;
    case "text":
      return <div style={{ fontSize: (p.size as number) || 12, textAlign: (p.align as Align) || "left", color: (p.color as string) || "#5b6478", lineHeight: 1.7, margin: "2px 0" }}>{lines(p.text as string)}</div>;
    case "divider":
      return <div style={{ height: 1, background: (p.color as string) || "#e8ecf3", margin: "12px 0" }} />;
    case "spacer":
      return <div style={{ height: (p.height as number) || 24 }} />;
    default:
      return null;
  }
}

/* ================================================================== *
 * Small building blocks
 * ================================================================== */
function DropZone({ active, onOver, onDrop, first }: { active: boolean; onOver: (e: React.DragEvent) => void; onDrop: (e: React.DragEvent) => void; first?: boolean }) {
  return (
    <div
      onDragOver={onOver}
      onDrop={onDrop}
      style={{
        height: active ? 26 : first ? 6 : 10,
        margin: "1px 0",
        borderRadius: 6,
        background: active ? "#dbe7ff" : "transparent",
        border: active ? "2px dashed #2f6bed" : "2px dashed transparent",
        transition: "all .12s",
      }}
    />
  );
}

function Inline({
  value,
  onChange,
  bold,
  size = 13,
  align = "left",
  upper,
  color,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  bold?: boolean;
  size?: number;
  align?: Align;
  upper?: boolean;
  color?: string;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        border: "1px solid transparent",
        borderRadius: 5,
        padding: "2px 4px",
        width: "100%",
        fontSize: size,
        fontWeight: bold ? 800 : 500,
        textAlign: align,
        textTransform: upper ? "uppercase" : "none",
        letterSpacing: upper ? "1px" : "normal",
        color: color || "#1e2433",
        background: "transparent",
      }}
      onFocus={(e) => (e.currentTarget.style.background = "#f5f9ff")}
      onBlur={(e) => (e.currentTarget.style.background = "transparent")}
    />
  );
}

function Area({ value, onChange, size = 12, color }: { value: string; onChange: (v: string) => void; size?: number; color?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={Math.max(1, (value || "").split("\n").length)}
      style={{
        border: "1px solid transparent",
        borderRadius: 5,
        padding: "2px 4px",
        width: "100%",
        fontSize: size,
        color: color || "#5b6478",
        background: "transparent",
        resize: "vertical",
        lineHeight: 1.5,
        fontFamily: "inherit",
      }}
      onFocus={(e) => (e.currentTarget.style.background = "#f5f9ff")}
      onBlur={(e) => (e.currentTarget.style.background = "transparent")}
    />
  );
}

function StyleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "#5b6478" }}>{label}</span>
      {children}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 26, height: 26, border: "none", background: "none", cursor: "pointer", padding: 0 }} />
      <input value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 82, border: "1px solid #e2e8f5", borderRadius: 7, padding: "5px 7px", fontSize: 11.5, fontWeight: 700, fontFamily: "'Space Grotesk', monospace" }} />
    </div>
  );
}

function TBtn({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #eef1f7", background: "#fff", color: disabled ? "#c2cbdd" : "#1e2433", fontSize: 16, cursor: disabled ? "default" : "pointer" }}>
      {children}
    </button>
  );
}

/* shared styles */
const paneCard: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #eef1f7" };
const paneLabel: React.CSSProperties = { fontSize: 11, color: "#9aa3b5", fontWeight: 700, letterSpacing: ".4px", marginBottom: 12 };
const paletteIcon: React.CSSProperties = { width: 26, height: 26, flex: "0 0 26px", borderRadius: 7, background: "#eef3fd", color: "#2f6bed", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 };
const primaryBtn: React.CSSProperties = { border: "none", background: "#2f6bed", color: "#fff", fontWeight: 800, fontSize: 12.5, padding: "9px 14px", borderRadius: 9, cursor: "pointer" };
const ghostBtn: React.CSSProperties = { border: "1px solid #e2e8f5", background: "#fff", color: "#1e2433", fontWeight: 800, fontSize: 12.5, padding: "9px 12px", borderRadius: 9, cursor: "pointer" };
const cellInput: React.CSSProperties = { width: "100%", border: "1px solid #e6ebf5", borderRadius: 6, padding: "5px 6px", fontSize: 11.5, fontWeight: 600, background: "#fff", fontFamily: "inherit" };
const miniSelect: React.CSSProperties = { border: "1px solid #e2e8f5", borderRadius: 7, padding: "5px 7px", fontSize: 11.5, fontWeight: 700, background: "#fbfcfe" };
const tinyBtn: React.CSSProperties = { width: 22, height: 22, borderRadius: 6, border: "1px solid #e6ebf5", background: "#fff", color: "#5b6478", fontSize: 11, fontWeight: 800, cursor: "pointer", lineHeight: 1 };
function ctrlBtn(cursor: string): React.CSSProperties {
  return { width: 22, height: 22, borderRadius: 6, border: "1px solid #e2e8f5", background: "#fff", color: "#5b6478", fontSize: 12, fontWeight: 800, cursor, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(20,30,60,.08)" };
}
