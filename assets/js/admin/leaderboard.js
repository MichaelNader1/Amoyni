(function () {
  const admin = window.AmoyniAdminNav.mount("leaderboard", "Leaderboard");
  if (!admin) return;

  const tbody = document.getElementById("lb-tbody");

  async function load() {
    try {
      const rows = await window.AmoyniAPI.call("get_leaderboard", {});
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5"><div class="state-block"><div class="state-title">لا توجد بيانات كافية</div></div></td></tr>';
        return;
      }
      tbody.innerHTML = rows
        .map(function (u) {
          return (
            "<tr><td data-label=\"الترتيب\">#" + u.rank + "</td>" +
            '<td data-label="الاسم" class="font-bold">' + window.AmoyniUI.escapeHtml(u.full_name) + "</td>" +
            '<td data-label="الصف">' + (u.grade || "") + "</td>" +
            '<td data-label="الرصيد">' + window.AmoyniUI.formatNumber(u.current_balance) + "</td>" +
            '<td data-label="Streak">🔥 ' + u.current_streak + "</td></tr>"
          );
        })
        .join("");
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="state-block state-error"><div class="state-title">تعذّر التحميل</div></div></td></tr>';
    }
  }
  load();
})();
