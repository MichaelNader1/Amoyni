(function () {
  const admin = window.AmoyniAdminNav.mount("reports", "التقارير");
  if (!admin) return;

  let cache = { attendance: [], points: [], vouchers: [], donations: [] };

  function switchTab(key) {
    document.querySelectorAll(".tab-strip button").forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.tab === key);
    });
    document.querySelectorAll(".report-panel").forEach(function (p) {
      p.style.display = "none";
    });
    document.getElementById("tab-" + key).style.display = "block";
  }
  document.querySelectorAll(".tab-strip button").forEach(function (b) {
    b.addEventListener("click", function () {
      switchTab(b.dataset.tab);
    });
  });

  async function loadAttendance() {
    const rows = await window.AmoyniAPI.call("get_admin_meetings", {});
    cache.attendance = rows;
    document.getElementById("report-attendance-tbody").innerHTML = rows
      .map(function (m) {
        return (
          "<tr><td data-label=\"الاجتماع\">" + window.AmoyniUI.escapeHtml(m.title) + "</td>" +
          '<td data-label="التاريخ">' + window.AmoyniUI.formatDate(m.meeting_date) + "</td>" +
          '<td data-label="عدد الحضور">' + m.attendance_count + "</td>" +
          '<td data-label="النقاط الموزعة">' + m.total_points_awarded + "</td></tr>"
        );
      })
      .join("");
  }

  async function loadPoints() {
    const rows = await window.AmoyniAPI.call("get_report_points_breakdown", {});
    cache.points = rows;
    document.getElementById("report-points-tbody").innerHTML = rows
      .map(function (r) {
        return (
          "<tr><td data-label=\"النوع\">" + r.type + "</td>" +
          '<td data-label="إجمالي إضافة">' + (r.total_credit || 0) + "</td>" +
          '<td data-label="إجمالي خصم">' + (r.total_debit || 0) + "</td>" +
          '<td data-label="عدد العمليات">' + r.tx_count + "</td></tr>"
        );
      })
      .join("");
  }

  async function loadVouchers() {
    const rows = await window.AmoyniAPI.call("get_admin_vouchers", {});
    cache.vouchers = rows;
    document.getElementById("report-vouchers-tbody").innerHTML = rows
      .map(function (v) {
        return (
          "<tr><td data-label=\"الكود\">" + v.code + "</td>" +
          '<td data-label="النقاط">' + v.points + "</td>" +
          '<td data-label="الاستخدامات">' + v.used_count + " / " + v.max_uses + "</td>" +
          '<td data-label="الحالة">' + v.status + "</td></tr>"
        );
      })
      .join("");
  }

  async function loadDonations() {
    const rows = await window.AmoyniAPI.call("get_donation_transactions_admin", {});
    cache.donations = rows;
    document.getElementById("report-donations-tbody").innerHTML = rows.length
      ? rows
          .map(function (d) {
            return (
              "<tr><td data-label=\"الحملة\">" + window.AmoyniUI.escapeHtml(d.campaign_title) + "</td>" +
              '<td data-label="المتبرع">' + window.AmoyniUI.escapeHtml(d.donor_name) + "</td>" +
              '<td data-label="المستفيد">' + window.AmoyniUI.escapeHtml(d.beneficiary_name) + "</td>" +
              '<td data-label="القيمة">' + d.amount + "</td>" +
              '<td data-label="التاريخ">' + window.AmoyniUI.formatDate(d.created_at) + "</td></tr>"
            );
          })
          .join("")
      : '<tr><td colspan="5"><div class="text-sm text-muted">لا توجد تبرعات بعد</div></td></tr>';
  }

  document.getElementById("export-attendance").addEventListener("click", function () {
    window.AmoyniUI.downloadCSV("report-attendance", cache.attendance, [
      { key: "title", label: "الاجتماع" }, { key: "meeting_date", label: "التاريخ" },
      { key: "attendance_count", label: "عدد الحضور" }, { key: "total_points_awarded", label: "النقاط الموزعة" },
    ]);
  });
  document.getElementById("export-points").addEventListener("click", function () {
    window.AmoyniUI.downloadCSV("report-points", cache.points, [
      { key: "type", label: "النوع" }, { key: "total_credit", label: "إجمالي إضافة" },
      { key: "total_debit", label: "إجمالي خصم" }, { key: "tx_count", label: "عدد العمليات" },
    ]);
  });
  document.getElementById("export-vouchers").addEventListener("click", function () {
    window.AmoyniUI.downloadCSV("report-vouchers", cache.vouchers, [
      { key: "code", label: "الكود" }, { key: "points", label: "النقاط" },
      { key: "used_count", label: "الاستخدامات" }, { key: "max_uses", label: "أقصى استخدام" }, { key: "status", label: "الحالة" },
    ]);
  });
  document.getElementById("export-donations").addEventListener("click", function () {
    window.AmoyniUI.downloadCSV("report-donations", cache.donations, [
      { key: "campaign_title", label: "الحملة" }, { key: "donor_name", label: "المتبرع" },
      { key: "beneficiary_name", label: "المستفيد" }, { key: "amount", label: "القيمة" }, { key: "created_at", label: "التاريخ" },
    ]);
  });

  Promise.all([loadAttendance(), loadPoints(), loadVouchers(), loadDonations()]).catch(function (err) {
    window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
  });
})();
