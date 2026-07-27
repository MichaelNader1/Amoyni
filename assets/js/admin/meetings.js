(function () {
  const admin = window.AmoyniAdminNav.mount("meetings", "الاجتماعات");
  if (!admin) return;

  const STATUS_LABEL = { draft: "مسودة", active: "نشط", closed: "مغلق", archived: "مؤرشف" };
  const tbody = document.getElementById("meetings-tbody");

  async function load(status) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="skeleton skeleton-text"></div></td></tr>';
    try {
      const rows = await window.AmoyniAPI.call("get_admin_meetings", { p_status: status || null });
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6"><div class="state-block"><div class="state-title">لا توجد اجتماعات</div></div></td></tr>';
        return;
      }
      tbody.innerHTML = rows
        .map(function (m) {
          return (
            "<tr>" +
            '<td data-label="الاجتماع"><a href="meeting-details.html?id=' + m.id + '" class="font-bold">' + window.AmoyniUI.escapeHtml(m.title) + "</a></td>" +
            '<td data-label="التاريخ">' + window.AmoyniUI.formatDate(m.meeting_date) + "</td>" +
            '<td data-label="الحالة"><span class="status-dot ' + m.status + '"></span> ' + STATUS_LABEL[m.status] + "</td>" +
            '<td data-label="الحضور">' + window.AmoyniUI.formatNumber(m.attendance_count) + "</td>" +
            '<td data-label="النقاط الموزعة">' + window.AmoyniUI.formatNumber(m.total_points_awarded) + "</td>" +
            '<td><a href="meeting-details.html?id=' + m.id + '" class="btn btn-secondary btn-sm">التفاصيل</a></td>' +
            "</tr>"
          );
        })
        .join("");
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="state-block state-error"><div class="state-title">تعذّر تحميل الاجتماعات</div></div></td></tr>';
    }
  }

  document.getElementById("status-filter").addEventListener("change", function (e) {
    load(e.target.value);
  });

  load();
})();
