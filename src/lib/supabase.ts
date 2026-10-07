import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

function createSupabaseClient(): SupabaseClient | null {
  if (!url || !anonKey) return null
  try {
    return createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } },
    })
  } catch {
    // Malformed URL / key — treat the project as not configured rather than crash.
    return null
  }
}

/**
 * Single shared Supabase client, or `null` when the project is not configured.
 * Only Realtime (Broadcast + Presence) is used, so the anon key is sufficient.
 */
export const supabase: SupabaseClient | null = createSupabaseClient()

/**
 * True when a working client was created. The app never fabricates data when
 * this is false — it shows a setup notice instead.
 */
export const isSupabaseConfigured = supabase !== null
