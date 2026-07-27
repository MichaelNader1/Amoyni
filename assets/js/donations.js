(function () {
  const session = window.AmoyniSession.requireYouth("login.html");
  if (!session) return;

  const listEl = document.getElementById("campaigns-list");

  function avatarImg(url) {
    return url ? '<img src="' + url + '" alt="">' : "";
  }

  function openDonateModal(campaign) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML =
      '<div class="modal">' +
      '<div class="modal-handle"></div>' +
      '<div class="modal-title">تبرّع لـ ' + window.AmoyniUI.escapeHtml(campaign.title) + "</div>" +
      '<div class="modal-body">لصالح: ' + window.AmoyniUI.escapeHtml(campaign.beneficiary_name) + "</div>" +
      '<div class="field" id="donate-amount-field">' +
      '<label class="field-label">عدد النقاط</label>' +
      '<input type="number" min="1" step="1" class="field-input" id="donate-amount-input" placeholder="مثال: 20">' +
      '<div class="field-error-text"></div>' +
      "</div>" +
      '<div class="modal-actions">' +
      '<button class="btn btn-secondary" data-action="cancel">إلغاء</button>' +
      '<button class="btn btn-primary" data-action="confirm"><span class="btn-label">تأكيد التبرع</span></button>' +
      "</div></div>";
    document.body.appendChild(overlay);
    requestAnimationFrame(function () {
      overlay.classList.add("is-open");
    });

    function close() {
      overlay.classList.remove("is-open");
      setTimeout(function () {
        overlay.remove();
      }, 250);
    }
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });
    overlay.querySelector('[data-action="cancel"]').addEventListener("click", close);
    overlay.querySelector('[data-action="confirm"]').addEventListener("click", async function () {
      const input = document.getElementById("donate-amount-input");
      const field = document.getElementById("donate-amount-field");
      const amount = parseInt(input.value, 10);
      window.AmoyniValidate.clearFieldError(field);
      if (!amount || amount <= 0) {
        window.AmoyniValidate.setFieldError(field, "اكتب عدد نقط صحيح");
        return;
      }
      const btn = overlay.querySelector('[data-action="confirm"]');
      window.AmoyniUI.setButtonLoading(btn, true);
      try {
        const result = await window.AmoyniAPI.call("create_donation", {
          p_donor_id: session.user_id,
          p_campaign_id: campaign.id,
          p_amount: amount,
        });
        window.AmoyniSession.updateYouth({ current_balance: result.donor_balance_after });
        close();
        window.AmoyniUI.toast("تم التبرع بنجاح، شكرًا لكرمك! ❤️", "success");
        window.AmoyniFX.fireCelebration();
        loadCampaigns();
      } catch (err) {
        window.AmoyniValidate.setFieldError(field, window.AmoyniUI.friendlyError(err));
        window.AmoyniUI.setButtonLoading(btn, false);
      }
    });
  }

  function renderCampaigns(list) {
    if (!list.length) {
      listEl.innerHTML = '<div class="state-block"><div class="state-title">لا توجد حملات تبرع حاليًا</div></div>';
      return;
    }
    listEl.innerHTML = "";
    list.forEach(function (c) {
      const card = document.createElement("div");
      card.className = "card campaign-card";
      const isClosed = c.status === "closed";
      card.innerHTML =
        (c.image_url ? '<img class="campaign-image" src="' + c.image_url + '" alt="">' : "") +
        '<div class="flex items-center gap-2 mb-2">' +
        '<div class="avatar avatar-sm">' + avatarImg(c.beneficiary_avatar_image_url) + "</div>" +
        '<div style="flex:1;">' +
        '<div class="font-bold">' + window.AmoyniUI.escapeHtml(c.title) + "</div>" +
        '<div class="text-xs text-muted">لصالح ' + window.AmoyniUI.escapeHtml(c.beneficiary_name) + "</div>" +
        "</div>" +
        (isClosed ? '<span class="badge badge-neutral">مغلقة</span>' : '<span class="badge badge-success">نشطة</span>') +
        "</div>" +
        (c.description ? '<p class="text-sm text-muted mb-3">' + window.AmoyniUI.escapeHtml(c.description) + "</p>" : "") +
        '<div class="flex justify-between text-sm mb-3">' +
        '<span>إجمالي التبرعات: <b>' + window.AmoyniUI.formatNumber(c.total_donated) + "</b></span>" +
        '<span class="text-muted">' + window.AmoyniUI.formatNumber(c.donation_count) + " متبرع</span>" +
        "</div>" +
        (isClosed
          ? '<button class="btn btn-secondary btn-block" disabled>الحملة مغلقة</button>'
          : '<button class="btn btn-primary btn-block" data-donate>تبرّع الآن</button>');
      if (!isClosed) {
        card.querySelector("[data-donate]").addEventListener("click", function () {
          openDonateModal(c);
        });
      }
      listEl.appendChild(card);
    });
  }

  async function loadCampaigns() {
    try {
      const list = await window.AmoyniAPI.call("get_donation_campaigns_public", {});
      renderCampaigns(list);
    } catch (err) {
      listEl.innerHTML = '<div class="state-block state-error"><div class="state-title">تعذّر تحميل الحملات</div></div>';
    }
  }
  loadCampaigns();
})();
