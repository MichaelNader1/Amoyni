(function () {
  const admin = window.AmoyniAdminNav.mount("users", "الشباب");
  if (!admin) return;

  const tbody = document.getElementById("users-tbody");
  let debounceTimer = null;

  async function load() {
    tbody.innerHTML = '<tr><td colspan="7"><div class="skeleton skeleton-text"></div></td></tr>';
    try {
      const rows = await window.AmoyniAPI.call("get_admin_users", {
        p_search: document.getElementById("search-input").value.trim() || null,
        p_grade: document.getElementById("grade-filter").value || null,
        p_status: document.getElementById("status-filter").value || null,
      });
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7"><div class="state-block"><div class="state-title">لا توجد نتائج</div></div></td></tr>';
        return;
      }
      tbody.innerHTML = rows
        .map(function (u) {
          return (
            "<tr>" +
            '<td data-label="الاسم"><a href="user-details.html?id=' + u.id + '" class="font-bold">' + window.AmoyniUI.escapeHtml(u.full_name) + "</a></td>" +
            '<td data-label="الهاتف">' + u.phone + "</td>" +
            '<td data-label="الصف">' + (u.grade || "") + "</td>" +
            '<td data-label="الرصيد">' + window.AmoyniUI.formatNumber(u.current_balance) + "</td>" +
            '<td data-label="Streak">🔥 ' + u.current_streak + "</td>" +
            '<td data-label="الحالة">' + (u.status === "active" ? '<span class="badge badge-success">نشط</span>' : '<span class="badge badge-danger">معطل</span>') + "</td>" +
            '<td><a href="user-details.html?id=' + u.id + '" class="btn btn-secondary btn-sm">التفاصيل</a></td>' +
            "</tr>"
          );
        })
        .join("");
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="state-block state-error"><div class="state-title">تعذّر تحميل القائمة</div></div></td></tr>';
    }
  }

  document.getElementById("search-input").addEventListener("input", function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(load, 350);
  });
  document.getElementById("grade-filter").addEventListener("change", load);
  document.getElementById("status-filter").addEventListener("change", load);

  load();
})();
