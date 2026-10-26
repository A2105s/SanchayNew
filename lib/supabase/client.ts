import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Browser-side Supabase client. Uses the publishable key, so every query is
 * subject to RLS - never give it the secret key.
 */
export const createClient = () => createBrowserClient(supabaseUrl!, supabaseKey!);
