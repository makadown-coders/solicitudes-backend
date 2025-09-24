// src/auth/supabase.ts
import { createClient } from '@supabase/supabase-js';
/*********** ARCHIVO EN PROCESO DE DEPRECACION ************/
const url = process.env.SUPABASE_URL!;
const anon = process.env.SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(url, anon);

export const supabaseAdmin = service
  ? createClient(url, service, { auth: { persistSession: false } })
  : null;
