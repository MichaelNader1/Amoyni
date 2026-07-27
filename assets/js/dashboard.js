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

  async function loadAvatar(avatarId, targets) {
    if (!avatarId) return;
    try {
      const rows = await window.AmoyniAPI.selectTable("avatars", {
        select: "image_url",
        eq: { id: avatarId },
      });
      if (rows && rows[0]) {
        targets.forEach(function (el) {
          el.innerHTML = '<img src="' + rows[0].image_url + '" alt="avatar">';
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

  async function init() {
    document.getElementById("greeting-text").textContent = greet() + " 👋";
    document.getElementById("user-name").textContent = session.full_name || "";

    loadAvatar(session.avatar_id, [
      document.getElementById("header-avatar"),
    ]);

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
      const meeting = await window.AmoyniAPI.call("get_active_meeting", {});
      if (meeting) {
        document.getElementById("active-meeting-section").style.display = "block";
        document.getElementById("no-meeting-section").style.display = "none";
        document.getElementById("meeting-title").textContent = meeting.title;
        document.getElementById("meeting-date").textContent = window.AmoyniUI.formatDate(meeting.meeting_date);
      }
    } catch (err) {
      /* silently keep "no active meeting" state */
    }
  }

  init();
})();
