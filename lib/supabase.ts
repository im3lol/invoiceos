import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Null when env vars are missing so the UI can fall back to localStorage. */
export const supabase = url && key ? createClient(url, key) : null;
