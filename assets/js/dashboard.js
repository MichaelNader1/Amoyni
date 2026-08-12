(function () {
  const session = window.AmoyniSession.requireYouth("login.html");
  if (!session) return;

  const TYPE_LABELS = {
    attendance: "حضور اجتماع",
    voucher: "استخدام كود",
    referral_inviter: "مكافأة دعوة صديق",
    referral_invitee: "مكافأة انضمام",
    donation_sent: "تبرع مُرسل",
    donation_received: "تبرع مُستلم",
    admin_addition: "إضافة من الأدمن",
    admin_deduction: "خصم من الأدمن",
    reversal: "تصحيح",
    correction: "تصحيح",
  };

  function greet() {
    const h = new Date().getHours();
    if (h < 12) return "صباح الخير";
    if (h < 18) return "مساء الخير";
    return "مساء النور";
  }

  async function loadAvatar(avatarId, targets, altText) {
    if (!avatarId) return;
    try {
      const rows = await window.AmoyniAPI.selectTable("avatars", {
        select: "image_url",
        eq: { id: avatarId },
      });
      if (rows && rows[0]) {
        targets.forEach(function (el) {
          el.innerHTML = window.AmoyniUI.avatarImgHtml(rows[0].image_url, altText);
        });
      }
    } catch (e) {
      /* non-fatal */
    }
  }

  function renderActivity(list) {
    const el = document.getElementById("recent-activity-list");
    if (!list || !list.length) {
      el.innerHTML =
        '<div class="state-block" style="padding:var(--space-6) 0;">' +
        '<div class="state-title" style="font-size:var(--fs-md)">لا توجد عمليات بعد</div>' +
        '<div class="text-sm">هتلاقي هنا آخر حضورك وتبرعاتك وأكواد الـVoucher</div></div>';
      return;
    }
    el.innerHTML = list
      .slice(0, 6)
      .map(function (t) {
        const isCredit = t.direction === "credit";
        return (
          '<div class="activity-item">' +
          '<div class="activity-icon ' + (isCredit ? "credit" : "debit") + '">' + (isCredit ? "↑" : "↓") + "</div>" +
          '<div style="flex:1;">' +
          '<div class="font-bold text-sm">' + (TYPE_LABELS[t.type] || t.type) + "</div>" +
          '<div class="text-xs text-muted">' + window.AmoyniUI.formatDateTime(t.created_at) + "</div>" +
          "</div>" +
          '<div class="activity-amount ' + (isCredit ? "credit" : "debit") + '">' +
          (isCredit ? "+" : "-") + window.AmoyniUI.formatNumber(t.amount) +
          "</div></div>"
        );
      })
      .join("");
  }

  function renderSpotlight(card) {
    const section = document.getElementById("spotlight-section");
    const noMeeting = document.getElementById("no-meeting-section");

    if (!card) {
      section.style.display = "none";
      noMeeting.style.display = "block";
      return;
    }
    noMeeting.style.display = "none";
    section.style.display = "block";

    const text = card.verse_text || card.announcement_text;
    const kicker = card.content_type === "announcement" ? "📢 إعلان الاجتماع" : "📖 آية اليوم";

    let html = '<div class="spotlight-card">';
    html += '<div class="spotlight-kicker"><span class="dot-live"></span> ' + window.AmoyniUI.escapeHtml(card.title) + "</div>";
    if (text) {
      html += '<div class="spotlight-kicker" style="margin-top:8px;">' + kicker + "</div>";
      html += '<div class="spotlight-text">' + window.AmoyniUI.escapeHtml(text) + "</div>";
    }

    if (card.has_attended) {
      if (card.raffle_number) {
        html +=
          '<div class="spotlight-raffle"><span class="label">🎟️ رقم الطمبولة الخاص بيك</span>' +
          '<span class="number">#' + card.raffle_number + "</span></div>";
      } else if (card.raffle_enabled) {
        html += '<div class="badge badge-warning mt-3">سجّلت حضورك، وأرقام الطمبولة خلصت</div>';
      }
    } else {
      html +=
        '<div class="spotlight-cta"><a href="scanner.html" class="btn btn-gold btn-block">' +
        "امسح QR وسجّل حضورك دلوقتي</a></div>";
    }
    html += "</div>";
    section.innerHTML = html;
  }

  async function init() {
    document.getElementById("greeting-text").textContent = greet() + " 👋";
    document.getElementById("user-name").textContent = session.full_name || "";

    loadAvatar(session.avatar_id, [
      document.getElementById("header-avatar"),
    ], session.full_name);

    try {
      const wallet = await window.AmoyniAPI.call("get_my_wallet", { p_user_id: session.user_id });
      window.AmoyniUI.animateCounter(document.getElementById("balance-value"), 0, wallet.current_balance || 0);
      document.getElementById("streak-value").textContent = wallet.current_streak || 0;
      renderActivity(wallet.recent_transactions);
      window.AmoyniSession.updateYouth({ current_balance: wallet.current_balance, current_streak: wallet.current_streak });
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    }

    try {
      const card = await window.AmoyniAPI.call("get_my_meeting_card", { p_user_id: session.user_id });
      renderSpotlight(card);
    } catch (err) {
      renderSpotlight(null);
    }
  }

  init();
})();
