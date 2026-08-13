// =====================================================================
// Amoyni — Session Management (youth + admin)
// Custom auth model: a small session object saved locally after a
// successful youth_login / admin_login RPC call. Remember-me sessions
// use localStorage; browser-session logins use sessionStorage.
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
      if (!s) {
        window.location.replace(redirectTo || "login.html");
        return null;
      }
      return s;
    },

    // Call at the top of every admin-protected page.
    requireAdmin(redirectTo) {
      const s = this.getAdmin();
      if (!s) {
        window.location.replace(redirectTo || "login.html");
        return null;
      }
      return s;
    },

    redirectIfYouthLoggedIn(target) {
      if (this.getYouth()) window.location.replace(target || "dashboard.html");
    },
    redirectIfAdminLoggedIn(target) {
      if (this.getAdmin()) window.location.replace(target || "index.html");
    },

    youthLogout(redirectTo) {
      this.clearYouth();
      window.location.replace(redirectTo || "login.html");
    },
    adminLogout(redirectTo) {
      this.clearAdmin();
      window.location.replace(redirectTo || "login.html");
    },
  };
})();
