import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function makeSupabase(options) {
  return supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, options) : null;
}
