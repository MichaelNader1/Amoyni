// =====================================================================
// Amoyni — Session Management (youth + admin)
// Custom auth model backed by opaque server-issued session tokens.
// The database stores only SHA-256 token hashes; the browser stores the
// one-time plaintext token returned by youth_login/admin_login.
// =====================================================================
window.AmoyniSession = (function () {
  const YOUTH_KEY = "amoyni_youth_session";
  const ADMIN_KEY = "amoyni_admin_session";

  function write(key, data, persist) {
    const payload = JSON.stringify(data);
    if (persist) {
      localStorage.setItem(key, payload);
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, payload);
      localStorage.removeItem(key);
    }
  }

  function read(key) {
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clear(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }

  function hasServerToken(session) {
    return !!(session && typeof session.session_token === "string" && /^[0-9a-f]{64}$/i.test(session.session_token));
  }

  return {
    setYouth(data, persist) {
      write(YOUTH_KEY, data, persist !== false);
    },
    getYouth() {
      return read(YOUTH_KEY);
    },
    clearYouth() {
      clear(YOUTH_KEY);
    },
    updateYouth(patch) {
      const current = this.getYouth();
      if (!current) return;
      const persisted = !!localStorage.getItem(YOUTH_KEY);
      this.setYouth(Object.assign({}, current, patch), persisted);
    },

    setAdmin(data, persist) {
      write(ADMIN_KEY, data, persist !== false);
    },
    getAdmin() {
      return read(ADMIN_KEY);
    },
    clearAdmin() {
      clear(ADMIN_KEY);
    },

    // Call at the top of every youth-protected page.
    requireYouth(redirectTo) {
      const s = this.getYouth();
      if (!hasServerToken(s)) {
        this.clearYouth();
        window.location.replace(redirectTo || "login.html");
        return null;
      }
      return s;
    },

    // Call at the top of every admin-protected page.
    requireAdmin(redirectTo) {
      const s = this.getAdmin();
      if (!hasServerToken(s)) {
        this.clearAdmin();
        window.location.replace(redirectTo || "login.html");
        return null;
      }
      return s;
    },

    redirectIfYouthLoggedIn(target) {
      const session = this.getYouth();
      if (hasServerToken(session)) window.location.replace(target || "dashboard.html");
      else if (session) this.clearYouth();
    },
    redirectIfAdminLoggedIn(target) {
      const session = this.getAdmin();
      if (hasServerToken(session)) window.location.replace(target || "index.html");
      else if (session) this.clearAdmin();
    },

    async youthLogout(redirectTo) {
      const session = this.getYouth();
      try {
        if (hasServerToken(session) && window.AmoyniAPI) {
          await window.AmoyniAPI.call("logout_app_session", { p_session_token: session.session_token });
        }
      } catch (error) {
        // Local logout must still complete if the network/session already expired.
      } finally {
        this.clearYouth();
        window.location.replace(redirectTo || "login.html");
      }
    },
    async adminLogout(redirectTo) {
      const session = this.getAdmin();
      try {
        if (hasServerToken(session) && window.AmoyniAPI) {
          await window.AmoyniAPI.call("logout_app_session", { p_session_token: session.session_token });
        }
      } catch (error) {
        // Local logout must still complete if the network/session already expired.
      } finally {
        this.clearAdmin();
        window.location.replace(redirectTo || "login.html");
      }
    },
  };
})();
