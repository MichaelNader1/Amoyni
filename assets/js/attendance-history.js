(function () {
  const session = window.AmoyniSession.requireYouth("login.html");
  if (!session) return;

  const listEl = document.getElementById("history-list");

  async function init() {
    try {
      const rows = await window.AmoyniAPI.call("get_my_attendance_history", { p_user_id: session.user_id });
      if (!rows || !rows.length) {
        listEl.innerHTML =
          '<div class="state-block"><div class="state-title">لا يوجد سجل حضور بعد</div>' +
          '<div class="text-sm">أول اجتماع تحضره هيظهر هنا</div></div>';
        return;
      }
      listEl.innerHTML = rows
        .map(function (r) {
          return (
            '<div class="card mb-3">' +
            '<div class="flex justify-between items-center">' +
            '<div>' +
            '<div class="font-bold">' + window.AmoyniUI.escapeHtml(r.meeting_title) + "</div>" +
            '<div class="text-xs text-muted">' + window.AmoyniUI.formatDateTime(r.created_at) + "</div>" +
            "</div>" +
            '<div class="text-left">' +
            '<div class="badge badge-success">+' + window.AmoyniUI.formatNumber(r.points_awarded) + " نقطة</div>" +
            (r.raffle_number
              ? '<div class="text-xs text-muted mt-1">طمبولة #' + r.raffle_number + "</div>"
              : "") +
            "</div></div></div>"
          );
        })
        .join("");
    } catch (err) {
      listEl.innerHTML = '<div class="state-block state-error"><div class="state-title">تعذّر تحميل السجل</div></div>';
    }
  }
  init();
})();
