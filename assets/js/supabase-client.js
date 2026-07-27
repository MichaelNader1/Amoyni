// =====================================================================
// Amoyni — Supabase Client (single source of truth)
// Every page includes, in order:
//   1) assets/vendor/supabase.js   (the Supabase JS SDK, vendored locally)
//   2) config.js                   (window.AMOYNI_CONFIG)
//   3) assets/js/supabase-client.js (this file -> window.sb)
// After that, any page/script can just call window.sb.rpc(...) / .from(...)
// =====================================================================
(function () {
  if (!window.AMOYNI_CONFIG) {
    console.error("[Amoyni] config.js لم يتم تحميله قبل supabase-client.js");
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    console.error("[Amoyni] مكتبة Supabase (assets/vendor/supabase.js) لم يتم تحميلها");
    return;
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.AMOYNI_CONFIG;

  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // This project uses a custom phone/password auth model (see the
      // RPC functions youth_login/admin_login/register_youth_user),
      // not Supabase Auth sessions — so we disable the SDK's own
      // session persistence/refresh to avoid confusion with our own
      // localStorage-based session (assets/js/auth.js).
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
})();
