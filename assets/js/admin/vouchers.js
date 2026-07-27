(function () {
  const admin = window.AmoyniAdminNav.mount("vouchers", "Vouchers");
  if (!admin) return;

  const STATUS_LABEL = { active: "نشط", paused: "متوقف", exhausted: "منتهي" };
  const tbody = document.getElementById("vouchers-tbody");

  async function load() {
    tbody.innerHTML = '<tr><td colspan="6"><div class="skeleton skeleton-text"></div></td></tr>';
    try {
      const rows = await window.AmoyniAPI.call("get_admin_vouchers", {});
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6"><div class="state-block"><div class="state-title">لا توجد أكواد بعد</div></div></td></tr>';
        return;
      }
      tbody.innerHTML = rows
        .map(function (v) {
          return (
            "<tr>" +
            '<td data-label="الكود" class="font-bold">' + v.code + "</td>" +
            '<td data-label="النقاط">' + v.points + "</td>" +
            '<td data-label="الاستخدامات">' + v.used_count + " / " + v.max_uses + "</td>" +
            '<td data-label="المتبقي">' + v.remaining_uses + "</td>" +
            '<td data-label="الحالة"><span class="badge ' + (v.status === "active" ? "badge-success" : v.status === "paused" ? "badge-warning" : "badge-neutral") + '">' + STATUS_LABEL[v.status] + "</span></td>" +
            '<td>' +
            (v.status === "active"
              ? '<button class="btn btn-secondary btn-sm" data-pause="' + v.voucher_id + '">إيقاف</button>'
              : v.status === "paused"
              ? '<button class="btn btn-secondary btn-sm" data-activate="' + v.voucher_id + '">تفعيل</button>'
              : "") +
            "</td></tr>"
          );
        })
        .join("");
      tbody.querySelectorAll("[data-pause]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          setStatus(btn.dataset.pause, "paused");
        });
      });
      tbody.querySelectorAll("[data-activate]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          setStatus(btn.dataset.activate, "active");
        });
      });
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="state-block state-error"><div class="state-title">تعذّر التحميل</div></div></td></tr>';
    }
  }

  async function setStatus(id, status) {
    try {
      await window.AmoyniAPI.call("set_voucher_status", { p_admin_id: admin.admin_id, p_voucher_id: id, p_status: status });
      window.AmoyniUI.toast("تم التحديث", "success");
      load();
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    }
  }

  document.getElementById("new-voucher-btn").addEventListener("click", function () {
    window.AmoyniUI.openModal({
      title: "إنشاء كود جديد",
      bodyHtml:
        '<div class="field" style="margin-bottom:10px;"><label class="field-label">الكود</label><input class="field-input" id="nv-code" placeholder="WELCOME50"></div>' +
        '<div class="field" style="margin-bottom:10px;"><label class="field-label">النقاط</label><input class="field-input" type="number" id="nv-points" min="1" value="10"></div>' +
        '<div class="field" style="margin-bottom:10px;"><label class="field-label">أقصى عدد استخدامات</label><input class="field-input" type="number" id="nv-max" min="1" value="50"></div>' +
        '<div class="field" style="margin-bottom:0;"><label class="field-label">رسالة النجاح</label><input class="field-input" id="nv-message" placeholder="مبروك! حصلت على نقط"></div>',
      confirmLabel: "إنشاء",
      cancelLabel: "إلغاء",
      onConfirm: async function () {
        const code = document.getElementById("nv-code").value.trim();
        const points = parseInt(document.getElementById("nv-points").value, 10);
        const max = parseInt(document.getElementById("nv-max").value, 10);
        const message = document.getElementById("nv-message").value.trim();
        if (!code || !points || !max) {
          window.AmoyniUI.toast("املأ كل الحقول", "error");
          return;
        }
        try {
          await window.AmoyniAPI.call("create_voucher", {
            p_admin_id: admin.admin_id,
            p_code: code,
            p_points: points,
            p_max_uses: max,
            p_success_message: message || null,
            p_internal_note: null,
          });
          window.AmoyniUI.toast("تم إنشاء الكود", "success");
          load();
        } catch (err) {
          window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
        }
      },
    });
  });

  load();
})();
