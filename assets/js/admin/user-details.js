(function () {
  const admin = window.AmoyniAdminNav.mount("users", "تفاصيل الشاب");
  if (!admin) return;

  const userId = new URLSearchParams(window.location.search).get("id");
  if (!userId) {
    window.location.href = "users.html";
    return;
  }

  let currentStatus = "active";

  function renderSummary(profile) {
    currentStatus = profile.status;
    document.getElementById("user-summary").innerHTML =
      '<div class="flex items-center gap-3">' +
      '<div class="avatar avatar-lg avatar-framed">' + (profile.avatar_image_url ? '<img src="' + profile.avatar_image_url + '">' : "") + "</div>" +
      '<div><div class="font-bold" style="font-size:var(--fs-lg);">' + window.AmoyniUI.escapeHtml(profile.full_name) + "</div>" +
      '<div class="text-sm text-muted">' + profile.phone + " · " + (profile.grade || "") + "</div>" +
      (profile.status === "active" ? '<span class="badge badge-success mt-1">نشط</span>' : '<span class="badge badge-danger mt-1">معطل</span>') +
      "</div></div>";

    document.getElementById("edit-full_name").value = profile.full_name;
    document.getElementById("edit-phone").value = profile.phone;
    document.getElementById("edit-birth_date").value = profile.birth_date || "";
    document.getElementById("edit-grade").value = profile.grade;

    const toggleBtn = document.getElementById("toggle-status-btn");
    toggleBtn.querySelector(".btn-label") ? null : (toggleBtn.innerHTML = '<span class="btn-label"></span>');
    toggleBtn.querySelector(".btn-label").textContent = profile.status === "active" ? "تعطيل الحساب" : "تفعيل الحساب";
  }

  function renderWallet(wallet) {
    document.getElementById("wallet-summary").innerHTML =
      '<div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);">' +
      '<div class="kpi-card"><div class="kpi-value">' + window.AmoyniUI.formatNumber(wallet.current_balance) + '</div><div class="kpi-label">الرصيد</div></div>' +
      '<div class="kpi-card"><div class="kpi-value">' + wallet.current_streak + '</div><div class="kpi-label">Streak</div></div>' +
      '<div class="kpi-card"><div class="kpi-value">' + window.AmoyniUI.formatNumber(wallet.total_earned) + '</div><div class="kpi-label">إجمالي المكتسب</div></div>' +
      '<div class="kpi-card"><div class="kpi-value">' + wallet.attendance_count + '</div><div class="kpi-label">عدد مرات الحضور</div></div>' +
      "</div>";
  }

  function renderAttendance(list) {
    const el = document.getElementById("attendance-list");
    if (!list.length) {
      el.innerHTML = '<div class="text-sm text-muted">لا يوجد سجل حضور</div>';
      return;
    }
    el.innerHTML = list
      .slice(0, 10)
      .map(function (a) {
        return (
          '<div class="flex justify-between text-sm" style="padding:6px 0;border-bottom:1px solid var(--color-border);">' +
          "<span>" + window.AmoyniUI.escapeHtml(a.meeting_title) + "</span>" +
          '<span class="text-muted">' + window.AmoyniUI.formatDate(a.created_at) + " (+" + a.points_awarded + ")</span></div>"
        );
      })
      .join("");
  }

  async function load() {
    try {
      const data = await window.AmoyniAPI.call("get_user_details", { p_user_id: userId });
      renderSummary(data.profile);
      renderWallet(data.wallet);
      renderAttendance(data.attendance_history);
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    }
  }

  document.getElementById("edit-user-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const btn = document.getElementById("save-user-btn");
    window.AmoyniUI.setButtonLoading(btn, true);
    try {
      await window.AmoyniAPI.call("admin_update_user", {
        p_admin_id: admin.admin_id,
        p_user_id: userId,
        p_full_name: document.getElementById("edit-full_name").value.trim(),
        p_phone: document.getElementById("edit-phone").value.trim(),
        p_birth_date: document.getElementById("edit-birth_date").value || null,
        p_grade: document.getElementById("edit-grade").value,
        p_avatar_id: null,
      });
      window.AmoyniUI.toast("تم حفظ التعديلات", "success");
      load();
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    } finally {
      window.AmoyniUI.setButtonLoading(btn, false);
    }
  });

  document.getElementById("reset-password-btn").addEventListener("click", function () {
    const overlay = window.AmoyniUI.openModal({
      title: "تغيير كلمة المرور",
      bodyHtml:
        '<div class="field" id="new-pw-field" style="margin-bottom:0;">' +
        '<input class="field-input" type="text" id="new-password-input" placeholder="كلمة مرور جديدة (6 خانات على الأقل)">' +
        '<div class="field-error-text"></div></div>',
      confirmLabel: "تغيير",
      cancelLabel: "إلغاء",
      onConfirm: async function () {
        const val = document.getElementById("new-password-input").value;
        if (!val || val.length < 6) {
          window.AmoyniUI.toast("كلمة المرور يجب ألا تقل عن 6 خانات", "error");
          return;
        }
        try {
          await window.AmoyniAPI.call("admin_set_password", { p_admin_id: admin.admin_id, p_user_id: userId, p_new_password: val });
          window.AmoyniUI.toast("تم تغيير كلمة المرور", "success");
        } catch (err) {
          window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
        }
      },
    });
  });

  document.getElementById("toggle-status-btn").addEventListener("click", function () {
    const newStatus = currentStatus === "active" ? "disabled" : "active";
    window.AmoyniUI.confirmAction(
      newStatus === "disabled" ? "تعطيل الحساب" : "تفعيل الحساب",
      newStatus === "disabled" ? "لن يستطيع الشاب تسجيل الدخول بعد التعطيل. متأكد؟" : "هل تريد إعادة تفعيل هذا الحساب؟",
      async function () {
        try {
          await window.AmoyniAPI.call("admin_set_user_status", { p_admin_id: admin.admin_id, p_user_id: userId, p_status: newStatus });
          window.AmoyniUI.toast("تم التحديث", "success");
          load();
        } catch (err) {
          window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
        }
      },
      { danger: newStatus === "disabled" }
    );
  });

  load();
})();
