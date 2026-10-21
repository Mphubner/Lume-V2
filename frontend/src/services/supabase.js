import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Enable this only after configuring and validating Google in Supabase and Google Cloud.
export const googleAuthEnabled = Boolean(supabase) && import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true';
