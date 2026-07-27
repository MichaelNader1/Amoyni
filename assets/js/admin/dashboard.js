(function () {
  const admin = window.AmoyniAdminNav.mount("dashboard", "لوحة التحكم");
  if (!admin) return;

  const KPI_LABELS = {
    total_youth: "عدد الشباب",
    active_accounts: "الحسابات النشطة",
    last_meeting_attendance: "حضور آخر اجتماع",
    total_points_earned: "إجمالي النقاط",
    total_voucher_uses: "استخدامات Voucher",
    total_donations: "إجمالي التبرعات",
    referral_registrations: "تسجيلات عبر الدعوة",
  };

  function renderKpis(summary) {
    const grid = document.getElementById("kpi-grid");
    grid.innerHTML = Object.keys(KPI_LABELS)
      .map(function (key) {
        return (
          '<div class="kpi-card"><div class="kpi-value">' +
          window.AmoyniUI.formatNumber(summary[key] || 0) +
          '</div><div class="kpi-label">' + KPI_LABELS[key] + "</div></div>"
        );
      })
      .join("");
  }

  function renderBarChart(containerId, items, labelKey, valueKey) {
    const el = document.getElementById(containerId);
    if (!items || !items.length) {
      el.innerHTML = '<div class="state-block" style="padding:var(--space-4) 0;"><div class="state-title" style="font-size:var(--fs-sm);">لا توجد بيانات كافية بعد</div></div>';
      return;
    }
    const max = Math.max.apply(null, items.map(function (i) { return i[valueKey] || 0; })) || 1;
    el.innerHTML = items
      .map(function (i) {
        const pct = Math.max(6, Math.round(((i[valueKey] || 0) / max) * 100));
        return (
          '<div class="bar-col">' +
          '<div class="bar-value">' + window.AmoyniUI.formatNumber(i[valueKey] || 0) + "</div>" +
          '<div class="bar" style="height:' + pct + '%;"></div>' +
          '<div class="bar-label">' + window.AmoyniUI.escapeHtml(String(i[labelKey]).slice(0, 10)) + "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderActivity(activity) {
    const cols = document.getElementById("recent-activity-cols");
    function list(title, items, renderItem) {
      return (
        '<div><div class="font-bold text-sm mb-2">' + title + "</div>" +
        (items && items.length
          ? items.map(renderItem).join("")
          : '<div class="text-xs text-muted">لا يوجد</div>') +
        "</div>"
      );
    }
    cols.innerHTML =
      list("آخر حضور", activity.attendance, function (a) {
        return '<div class="text-sm mb-2">' + window.AmoyniUI.escapeHtml(a.full_name) + ' <span class="text-muted text-xs">+' + a.points_awarded + "</span></div>";
      }) +
      list("آخر Voucher", activity.vouchers, function (v) {
        return '<div class="text-sm mb-2">' + window.AmoyniUI.escapeHtml(v.full_name) + " — " + v.code + "</div>";
      }) +
      list("آخر تبرع", activity.donations, function (d) {
        return '<div class="text-sm mb-2">' + window.AmoyniUI.escapeHtml(d.donor_name) + " ← " + window.AmoyniUI.escapeHtml(d.beneficiary_name) + " (" + d.amount + ")</div>";
      });
  }

  async function init() {
    try {
      const data = await window.AmoyniAPI.call("get_admin_dashboard", {});
      renderKpis(data.summary);
      renderBarChart("chart-attendance", data.attendance_by_meeting, "title", "attendance_count");
      renderBarChart("chart-grades", data.grade_distribution, "grade", "count");
      renderActivity(data.recent_activity);
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    }
  }
  init();
})();
