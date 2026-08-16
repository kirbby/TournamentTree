import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "") ?? "";
export const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
export const isBackendConfigured = Boolean(supabaseUrl && supabasePublishableKey && !supabaseUrl.includes("your-project"));

export const supabase = isBackendConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export const apiBaseUrl = isBackendConfigured
  ? `${supabaseUrl}/functions/v1/tournament-api/v1`
  : "";
