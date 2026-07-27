(function () {
  const admin = window.AmoyniAdminNav.mount("referrals", "الدعوات");
  if (!admin) return;

  const STATUS_LABEL = { pending: "بانتظار أول حضور", rewarded: "تمت المكافأة" };

  async function load() {
    try {
      const data = await window.AmoyniAPI.call("get_admin_referrals", {});
      const s = data.settings || {};
      document.getElementById("rs-enabled").checked = !!s.is_enabled;
      document.getElementById("rs-inviter").value = s.inviter_points || 0;
      document.getElementById("rs-invitee").value = s.invitee_points || 0;
      document.getElementById("rs-message").value = s.message || "";

      const summary = data.summary || {};
      document.getElementById("referral-kpis").innerHTML =
        '<div class="kpi-card"><div class="kpi-value">' + (summary.total_referrals || 0) + '</div><div class="kpi-label">إجمالي الدعوات</div></div>' +
        '<div class="kpi-card"><div class="kpi-value">' + (summary.rewarded_referrals || 0) + '</div><div class="kpi-label">تمت مكافأتها</div></div>' +
        '<div class="kpi-card"><div class="kpi-value">' + (summary.pending_referrals || 0) + '</div><div class="kpi-label">بانتظار الحضور</div></div>';

      const tbody = document.getElementById("referrals-tbody");
      if (!data.list.length) {
        tbody.innerHTML = '<tr><td colspan="4"><div class="state-block"><div class="state-title">لا توجد دعوات بعد</div></div></td></tr>';
      } else {
        tbody.innerHTML = data.list
          .map(function (r) {
            return (
              "<tr><td data-label=\"الداعي\">" + window.AmoyniUI.escapeHtml(r.inviter_name) + "</td>" +
              '<td data-label="المدعو">' + window.AmoyniUI.escapeHtml(r.invitee_name) + "</td>" +
              '<td data-label="الحالة"><span class="badge ' + (r.status === "rewarded" ? "badge-success" : "badge-warning") + '">' + STATUS_LABEL[r.status] + "</span></td>" +
              '<td data-label="التاريخ">' + window.AmoyniUI.formatDate(r.created_at) + "</td></tr>"
            );
          })
          .join("");
      }
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    }
  }

  document.getElementById("referral-settings-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const btn = document.getElementById("rs-save");
    window.AmoyniUI.setButtonLoading(btn, true);
    try {
      await window.AmoyniAPI.call("update_referral_settings", {
        p_admin_id: admin.admin_id,
        p_is_enabled: document.getElementById("rs-enabled").checked,
        p_inviter_points: parseInt(document.getElementById("rs-inviter").value, 10) || 0,
        p_invitee_points: parseInt(document.getElementById("rs-invitee").value, 10) || 0,
        p_message: document.getElementById("rs-message").value.trim() || null,
      });
      window.AmoyniUI.toast("تم حفظ الإعدادات", "success");
      load();
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    } finally {
      window.AmoyniUI.setButtonLoading(btn, false);
    }
  });

  load();
})();
