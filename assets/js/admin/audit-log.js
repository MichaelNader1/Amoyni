(function () {
  const admin = window.AmoyniAdminNav.mount("audit-log", "سجل العمليات");
  if (!admin) return;

  async function load() {
    try {
      const rows = await window.AmoyniAPI.call("get_admin_audit_log", { p_limit: 200 });
      const tbody = document.getElementById("audit-tbody");
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="4"><div class="state-block"><div class="state-title">لا يوجد سجل بعد</div></div></td></tr>';
        return;
      }
      tbody.innerHTML = rows
        .map(function (r) {
          return (
            "<tr><td data-label=\"المسؤول\">" + (r.admin_username || "—") + "</td>" +
            '<td data-label="الإجراء"><span class="badge badge-info">' + r.action + "</span></td>" +
            '<td data-label="الوصف">' + window.AmoyniUI.escapeHtml(r.description || "") + "</td>" +
            '<td data-label="التاريخ">' + window.AmoyniUI.formatDateTime(r.created_at) + "</td></tr>"
          );
        })
        .join("");
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    }
  }
  load();
})();
