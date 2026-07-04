import { supabase } from "./supabase";
import { EntityKind, genId } from "./domain";

/* CRUD for suppliers / customers / products. Each row = { id, data: <object> }.
 * Falls back to an in-memory map when Supabase isn't configured. */

const mem: Record<EntityKind, Record<string, unknown>[]> = { suppliers: [], customers: [], products: [] };
const prefixOf: Record<EntityKind, string> = { suppliers: "s", customers: "c", products: "p" };

export async function listEntities<T extends { id: string }>(kind: EntityKind): Promise<T[]> {
  if (!supabase) return mem[kind] as T[];
  const { data, error } = await supabase.from(kind).select("id,data").order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({ ...(r.data as object), id: r.id })) as T[];
}

export async function saveEntity<T extends { id?: string }>(kind: EntityKind, obj: T): Promise<T & { id: string }> {
  const id = obj.id || genId(prefixOf[kind]);
  const rec = { ...obj, id } as T & { id: string };
  if (!supabase) {
    const arr = mem[kind];
    const i = arr.findIndex((x) => (x as { id: string }).id === id);
    if (i >= 0) arr[i] = rec;
    else arr.push(rec);
    return rec;
  }
  const { error } = await supabase.from(kind).upsert({ id, data: rec });
  if (error) throw error;
  return rec;
}

export async function deleteEntity(kind: EntityKind, id: string): Promise<void> {
  if (!supabase) {
    mem[kind] = mem[kind].filter((x) => (x as { id: string }).id !== id);
    return;
  }
  const { error } = await supabase.from(kind).delete().eq("id", id);
  if (error) throw error;
}
