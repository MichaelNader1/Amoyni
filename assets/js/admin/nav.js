// =====================================================================
// Amoyni Admin — Shared Sidebar Navigation
// Each admin page includes a <aside class="sidebar" id="admin-sidebar">
// placeholder; this script fills it in and wires up the mobile drawer.
// =====================================================================
window.AmoyniAdminNav = (function () {
  const ITEMS = [
    { key: "dashboard", href: "index.html", label: "لوحة التحكم", icon: "🏠" },
    { key: "meetings", href: "meetings.html", label: "الاجتماعات", icon: "📅" },
    { key: "users", href: "users.html", label: "الشباب", icon: "👥" },
    { key: "points", href: "points.html", label: "النقاط", icon: "⭐" },
    { key: "vouchers", href: "vouchers.html", label: "Vouchers", icon: "🎟️" },
    { key: "referrals", href: "referrals.html", label: "الدعوات", icon: "🔗" },
    { key: "donations", href: "donations.html", label: "التبرعات", icon: "❤️" },
    { key: "leaderboard", href: "leaderboard.html", label: "Leaderboard", icon: "🏆" },
    { key: "reports", href: "reports.html", label: "التقارير", icon: "📊" },
    { key: "audit-log", href: "audit-log.html", label: "سجل العمليات", icon: "📜" },
    { key: "settings", href: "settings.html", label: "الإعدادات", icon: "⚙️" },
  ];

  function mount(activeKey, pageTitle) {
    const admin = window.AmoyniSession.requireAdmin("login.html");
    if (!admin) return null;

    const sidebar = document.getElementById("admin-sidebar");
    if (sidebar) {
      sidebar.innerHTML =
        '<div class="brand"><span class="brand-mark" style="padding:0;overflow:hidden;"><img src="../assets/images/logo/amoyni-logo.png" alt="Amoyni" style="width:100%;height:100%;object-fit:cover;"></span> Amoyni Admin</div>' +
        '<nav>' +
        ITEMS.map(function (it) {
          return (
            '<a href="' + it.href + '" class="' + (it.key === activeKey ? "is-active" : "") + '">' +
            '<span>' + it.icon + "</span><span>" + it.label + "</span></a>"
          );
        }).join("") +
        "</nav>" +
        '<div style="margin-top:auto;">' +
        '<div class="text-xs text-muted mb-2">مسجل الدخول كـ ' + window.AmoyniUI.escapeHtml(admin.display_name || admin.username) + "</div>" +
        '<button class="btn btn-secondary btn-block btn-sm" id="admin-logout-btn">تسجيل الخروج</button>' +
        "</div>";
      document.getElementById("admin-logout-btn").addEventListener("click", function () {
        window.AmoyniUI.confirmAction("تسجيل الخروج", "هل تريد تسجيل الخروج من لوحة التحكم؟", function () {
          window.AmoyniSession.adminLogout("login.html");
        });
      });
    }

    const titleEl = document.getElementById("admin-page-title");
    if (titleEl) titleEl.textContent = pageTitle || "";

    const toggleBtn = document.getElementById("sidebar-toggle-btn");
    const backdrop = document.getElementById("drawer-backdrop");
    if (toggleBtn && backdrop && sidebar) {
      toggleBtn.addEventListener("click", function () {
        sidebar.classList.add("is-drawer-open");
        backdrop.classList.add("is-open");
      });
      backdrop.addEventListener("click", function () {
        sidebar.classList.remove("is-drawer-open");
        backdrop.classList.remove("is-open");
      });
      sidebar.querySelectorAll("nav a").forEach(function (a) {
        a.addEventListener("click", function () {
          sidebar.classList.remove("is-drawer-open");
          backdrop.classList.remove("is-open");
        });
      });
    }

    return admin;
  }

  return { mount };
})();
