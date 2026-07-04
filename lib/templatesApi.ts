import { supabase } from "./supabase";
import type { TemplateDoc, TemplateRecord } from "./templateTypes";

/* Supabase-backed template store, with a localStorage fallback when the
 * client isn't configured (so the builder still works offline). */

const LS_KEY = "invoiceos.templates";

function lsLoad(): TemplateRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}
function lsSave(list: TemplateRecord[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, JSON.stringify(list));
}

export const usingSupabase = !!supabase;

export async function listTemplates(): Promise<TemplateRecord[]> {
  if (!supabase) return lsLoad();
  const { data, error } = await supabase
    .from("invoice_templates")
    .select("id,name,doc,published,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []) as TemplateRecord[];
}

export async function saveTemplate(name: string, doc: TemplateDoc, id?: string | null): Promise<TemplateRecord> {
  const payload = { name, doc };
  if (!supabase) {
    const list = lsLoad();
    if (id) {
      const idx = list.findIndex((t) => t.id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], name, doc, updated_at: new Date().toISOString() };
        lsSave(list);
        return list[idx];
      }
    }
    const rec: TemplateRecord = { id: "local_" + Date.now(), name, doc, published: false, updated_at: new Date().toISOString() };
    lsSave([rec, ...list]);
    return rec;
  }
  if (id) {
    const { data, error } = await supabase.from("invoice_templates").update(payload).eq("id", id).select().single();
    if (error) throw error;
    return data as TemplateRecord;
  }
  const { data, error } = await supabase.from("invoice_templates").insert(payload).select().single();
  if (error) throw error;
  return data as TemplateRecord;
}

export async function setPublished(id: string, published: boolean): Promise<void> {
  if (!supabase) {
    const list = lsLoad();
    const idx = list.findIndex((t) => t.id === id);
    if (idx >= 0) {
      list[idx].published = published;
      lsSave(list);
    }
    return;
  }
  const { error } = await supabase.from("invoice_templates").update({ published }).eq("id", id);
  if (error) throw error;
}

export async function deleteTemplate(id: string): Promise<void> {
  if (!supabase) {
    lsSave(lsLoad().filter((t) => t.id !== id));
    return;
  }
  const { error } = await supabase.from("invoice_templates").delete().eq("id", id);
  if (error) throw error;
}
