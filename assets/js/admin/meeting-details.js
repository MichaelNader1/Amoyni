(function () {
  const admin = window.AmoyniAdminNav.mount("meetings", "تفاصيل الاجتماع");
  if (!admin) return;

  const meetingId = new URLSearchParams(window.location.search).get("id");
  if (!meetingId) {
    window.location.href = "meetings.html";
    return;
  }

  const STATUS_LABEL = { draft: "مسودة", active: "نشط", closed: "مغلق", archived: "مؤرشف" };
  let currentMeeting = null;

  function renderHeader(m) {
    currentMeeting = m;
    document.getElementById("meeting-header").innerHTML =
      '<div class="flex justify-between items-center">' +
      '<div><div class="font-bold" style="font-size:var(--fs-lg);">' + window.AmoyniUI.escapeHtml(m.title) + "</div>" +
      '<div class="text-sm text-muted">' + window.AmoyniUI.formatDate(m.meeting_date) + "</div></div>" +
      '<span class="badge ' + (m.status === "active" ? "badge-success" : m.status === "closed" ? "badge-danger" : "badge-neutral") + '">' +
      STATUS_LABEL[m.status] + "</span></div>" +
      '<div class="divider"></div>' +
      '<div class="text-sm text-muted">وقت الحضور: ' + window.AmoyniUI.formatDateTime(m.attendance_start) + " → " + window.AmoyniUI.formatDateTime(m.attendance_end) + "</div>" +
      (m.raffle_enabled ? '<div class="text-sm text-muted mt-1">الطمبولة: من ' + m.raffle_start_number + " إلى " + m.raffle_end_number + "</div>" : "");

    document.getElementById("start-meeting-btn").style.display = m.status === "draft" ? "block" : "none";
    document.getElementById("close-meeting-btn").style.display = m.status === "active" ? "block" : "none";
    document.getElementById("add-rule-form").style.display = m.status === "draft" ? "block" : "none";
    document.getElementById("rules-locked-note").style.display = m.status === "draft" ? "none" : "block";

    if (m.status === "active" && m.qr_token) {
      document.getElementById("qr-section").style.display = "block";
      renderQR(m.id, m.qr_token);
    }
  }

  function renderQR(id, token) {
    const payload = JSON.stringify({ meeting_id: id, qr_token: token });
    const qr = qrcode(0, "M");
    qr.addData(payload);
    qr.make();
    const canvas = document.getElementById("qr-canvas");
    const cellSize = 6;
    const count = qr.getModuleCount();
    canvas.width = count * cellSize;
    canvas.height = count * cellSize;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111827";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      }
    }
  }

  function renderRules(rules) {
    const list = document.getElementById("rules-list");
    if (!rules.length) {
      list.innerHTML = '<div class="text-sm text-muted mb-2">لا توجد شرائح نقاط بعد</div>';
      return;
    }
    list.innerHTML = rules
      .map(function (r) {
        return (
          '<div class="flex justify-between items-center" style="padding:8px 0;border-bottom:1px solid var(--color-border);">' +
          '<div class="text-sm">' + window.AmoyniUI.formatDateTime(r.start_time) + " → " + window.AmoyniUI.formatDateTime(r.end_time) + "</div>" +
          '<div class="flex items-center gap-2"><span class="badge badge-info">' + r.points + " نقطة</span>" +
          (currentMeeting && currentMeeting.status === "draft"
            ? '<button class="btn btn-icon btn-ghost btn-sm" data-delete-rule="' + r.id + '">🗑️</button>'
            : "") +
          "</div></div>"
        );
      })
      .join("");
    list.querySelectorAll("[data-delete-rule]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        try {
          await window.AmoyniAPI.call("delete_point_rule", { p_admin_id: admin.admin_id, p_rule_id: btn.dataset.deleteRule });
          load();
        } catch (err) {
          window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
        }
      });
    });
  }

  function renderAttendance(rows) {
    const tbody = document.getElementById("attendance-tbody");
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="state-block"><div class="state-title">لا يوجد حضور بعد</div></div></td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(function (a) {
        return (
          "<tr>" +
          '<td data-label="الاسم">' + window.AmoyniUI.escapeHtml(a.full_name) + "</td>" +
          '<td data-label="الهاتف">' + a.phone + "</td>" +
          '<td data-label="الصف">' + (a.grade || "") + "</td>" +
          '<td data-label="الوقت">' + window.AmoyniUI.formatDateTime(a.created_at) + "</td>" +
          '<td data-label="النقاط">' + a.points_awarded + "</td>" +
          '<td data-label="الطمبولة">' + (a.raffle_number ? "#" + a.raffle_number : "—") + "</td>" +
          "</tr>"
        );
      })
      .join("");

    document.getElementById("export-attendance-btn").onclick = function () {
      window.AmoyniUI.downloadCSV("attendance-" + meetingId, rows, [
        { key: "full_name", label: "الاسم" },
        { key: "phone", label: "الهاتف" },
        { key: "grade", label: "الصف" },
        { key: "created_at", label: "الوقت" },
        { key: "points_awarded", label: "النقاط" },
        { key: "raffle_number", label: "رقم الطمبولة" },
      ]);
    };
  }

  async function load() {
    try {
      const data = await window.AmoyniAPI.call("get_meeting_details", { p_meeting_id: meetingId });
      renderHeader(data.meeting);
      renderRules(data.point_rules);
      renderAttendance(data.attendance);
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    }
  }

  document.getElementById("add-rule-btn").addEventListener("click", async function () {
    const start = document.getElementById("rule-start").value;
    const end = document.getElementById("rule-end").value;
    const points = parseInt(document.getElementById("rule-points").value, 10);
    if (!start || !end || isNaN(points)) {
      window.AmoyniUI.toast("املأ كل حقول الشريحة", "error");
      return;
    }
    try {
      await window.AmoyniAPI.call("add_point_rule", {
        p_admin_id: admin.admin_id,
        p_meeting_id: meetingId,
        p_start_time: new Date(start).toISOString(),
        p_end_time: new Date(end).toISOString(),
        p_points: points,
        p_sort_order: 0,
      });
      document.getElementById("rule-start").value = "";
      document.getElementById("rule-end").value = "";
      load();
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    }
  });

  document.getElementById("start-meeting-btn").addEventListener("click", function () {
    window.AmoyniUI.confirmAction("بدء الاجتماع", "بعد البدء لن تقدر تعدّل شرائح النقاط. متأكد؟", async function () {
      try {
        await window.AmoyniAPI.call("start_meeting", { p_admin_id: admin.admin_id, p_meeting_id: meetingId });
        window.AmoyniUI.toast("تم بدء الاجتماع، QR جاهز الآن", "success");
        load();
      } catch (err) {
        window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
      }
    });
  });

  document.getElementById("close-meeting-btn").addEventListener("click", function () {
    window.AmoyniUI.confirmAction("إغلاق الاجتماع", "لن يستطيع أي شاب تسجيل حضوره بعد الإغلاق. متأكد؟", async function () {
      try {
        await window.AmoyniAPI.call("close_meeting", { p_admin_id: admin.admin_id, p_meeting_id: meetingId });
        window.AmoyniUI.toast("تم إغلاق الاجتماع", "success");
        load();
      } catch (err) {
        window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
      }
    }, { danger: true });
  });

  load();
})();
