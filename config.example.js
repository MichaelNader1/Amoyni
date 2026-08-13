// =====================================================================
// Amoyni — Configuration Example
// -----------------------------------------------------------------
// Copy this file to `config.js` (same folder) and fill in your own
// Supabase project values. `config.js` is the file every page actually
// loads; it is NOT meant to be committed with real values in a public
// repo — keep it out of version control if your project is public.
//
// Where to find these values in Supabase:
//   Project Settings → API → Project URL           -> SUPABASE_URL
//   Project Settings → API → Project API keys (anon/public) -> SUPABASE_ANON_KEY
//
// SECURITY NOTE: only the "anon" public key belongs here. NEVER put the
// service_role key in any file under this folder — it must stay on a
// server or Supabase Edge Function only.
// =====================================================================

window.AMOYNI_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-PUBLIC-KEY",

  // Local/dev-only fallbacks (safe defaults, can be overridden by app_settings in DB)
  LEADERBOARD_LIMIT: 10,
  DEFAULT_LANGUAGE: "ar",
};
