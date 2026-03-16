import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client (use only in Server Components / Route Handlers)
export function createServerClient() {
  return createClient(supabaseUrl, process.env.SUPABASE_SECRET_KEY!);
}
