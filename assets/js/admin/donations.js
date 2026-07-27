(function () {
  const admin = window.AmoyniAdminNav.mount("donations", "التبرعات");
  if (!admin) return;

  const grid = document.getElementById("campaigns-grid");

  async function load() {
    try {
      const rows = await window.AmoyniAPI.call("get_admin_donation_campaigns", {});
      if (!rows.length) {
        grid.innerHTML = '<div class="state-block"><div class="state-title">لا توجد حملات بعد</div></div>';
        return;
      }
      grid.innerHTML = "";
      rows.forEach(function (c) {
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML =
          '<div class="flex justify-between items-center mb-2">' +
          '<div class="font-bold">' + window.AmoyniUI.escapeHtml(c.title) + "</div>" +
          '<span class="badge ' + (c.status === "active" ? "badge-success" : "badge-neutral") + '">' + (c.status === "active" ? "نشطة" : "مغلقة") + "</span></div>" +
          '<div class="text-sm text-muted mb-2">لصالح: ' + window.AmoyniUI.escapeHtml(c.beneficiary_name) + "</div>" +
          '<div class="flex justify-between text-sm mb-3">' +
          '<span>إجمالي: <b>' + window.AmoyniUI.formatNumber(c.total_donated) + "</b></span>" +
          '<span>' + c.unique_donor_count + " متبرع</span></div>" +
          '<div class="flex gap-2">' +
          '<button class="btn btn-secondary btn-sm btn-block" data-view="' + c.id + '">عرض التبرعات</button>' +
          (c.status === "active" ? '<button class="btn btn-danger btn-sm" data-close="' + c.id + '">إغلاق</button>' : "") +
          "</div>";
        grid.appendChild(card);
        card.querySelector("[data-view]").addEventListener("click", function () {
          viewTransactions(c);
        });
        const closeBtn = card.querySelector("[data-close]");
        if (closeBtn) {
          closeBtn.addEventListener("click", function () {
            window.AmoyniUI.confirmAction("إغلاق الحملة", "لن يمكن التبرع بعد الإغلاق. متأكد؟", async function () {
              try {
                await window.AmoyniAPI.call("close_donation_campaign", { p_admin_id: admin.admin_id, p_campaign_id: c.id });
                window.AmoyniUI.toast("تم إغلاق الحملة", "success");
                load();
              } catch (err) {
                window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
              }
            }, { danger: true });
          });
        }
      });
    } catch (err) {
      grid.innerHTML = '<div class="state-block state-error"><div class="state-title">تعذّر التحميل</div></div>';
    }
  }

  async function viewTransactions(campaign) {
    try {
      const txs = await window.AmoyniAPI.call("get_donation_transactions_admin", { p_campaign_id: campaign.id });
      const rowsHtml = txs.length
        ? txs
            .map(function (t) {
              return (
                '<div class="flex justify-between text-sm" style="padding:6px 0;border-bottom:1px solid var(--color-border);">' +
                "<span>" + window.AmoyniUI.escapeHtml(t.donor_name) + "</span><span class=\"font-bold\">" + t.amount + "</span></div>"
              );
            })
            .join("")
        : '<div class="text-sm text-muted">لا توجد تبرعات بعد</div>';

      window.AmoyniUI.openModal({
        title: "تبرعات: " + campaign.title,
        bodyHtml: '<div style="max-height:300px;overflow-y:auto;">' + rowsHtml + "</div>",
        confirmLabel: "تصدير CSV",
        cancelLabel: "إغلاق",
        onConfirm: function () {
          window.AmoyniUI.downloadCSV("donations-" + campaign.id, txs, [
            { key: "donor_name", label: "المتبرع" },
            { key: "beneficiary_name", label: "المستفيد" },
            { key: "amount", label: "القيمة" },
            { key: "created_at", label: "التاريخ" },
          ]);
        },
      });
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    }
  }

  document.getElementById("new-campaign-btn").addEventListener("click", async function () {
    let users = [];
    try {
      users = await window.AmoyniAPI.call("get_admin_users", { p_limit: 200 });
    } catch (e) {
      /* proceed with empty list */
    }
    const options = users.map(function (u) { return '<option value="' + u.id + '">' + window.AmoyniUI.escapeHtml(u.full_name) + " — " + u.phone + "</option>"; }).join("");

    window.AmoyniUI.openModal({
      title: "حملة تبرع جديدة",
      bodyHtml:
        '<div class="field" style="margin-bottom:10px;"><label class="field-label">عنوان الحملة</label><input class="field-input" id="nc-title"></div>' +
        '<div class="field" style="margin-bottom:10px;"><label class="field-label">الوصف</label><textarea class="field-textarea" id="nc-desc"></textarea></div>' +
        '<div class="field" style="margin-bottom:0;"><label class="field-label">المستفيد</label><select class="field-select" id="nc-beneficiary">' + options + "</select></div>",
      confirmLabel: "إنشاء وتفعيل",
      cancelLabel: "إلغاء",
      onConfirm: async function () {
        const title = document.getElementById("nc-title").value.trim();
        const desc = document.getElementById("nc-desc").value.trim();
        const beneficiary = document.getElementById("nc-beneficiary").value;
        if (!title || !beneficiary) {
          window.AmoyniUI.toast("العنوان والمستفيد مطلوبين", "error");
          return;
        }
        try {
          await window.AmoyniAPI.call("create_donation_campaign", {
            p_admin_id: admin.admin_id,
            p_title: title,
            p_description: desc || null,
            p_beneficiary_user_id: beneficiary,
            p_image_url: null,
          });
          window.AmoyniUI.toast("تم إنشاء الحملة", "success");
          load();
        } catch (err) {
          window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
        }
      },
    });
  });

  load();
})();
