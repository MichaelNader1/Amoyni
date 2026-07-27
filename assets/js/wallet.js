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

  const listEl = document.getElementById("transactions-list");

  function renderList(list) {
    if (!list || !list.length) {
      listEl.innerHTML =
        '<div class="state-block"><div class="state-title">لا توجد عمليات في هذا التصنيف</div></div>';
      return;
    }
    listEl.innerHTML = list
      .map(function (t) {
        const isCredit = t.direction === "credit";
        return (
          '<div class="activity-item">' +
          '<div class="activity-icon ' + (isCredit ? "credit" : "debit") + '">' + (isCredit ? "↑" : "↓") + "</div>" +
          '<div style="flex:1;">' +
          '<div class="font-bold text-sm">' + (TYPE_LABELS[t.type] || t.type) + "</div>" +
          '<div class="text-xs text-muted">' + window.AmoyniUI.formatDateTime(t.created_at) + "</div>" +
          (t.reason ? '<div class="text-xs text-muted">' + window.AmoyniUI.escapeHtml(t.reason) + "</div>" : "") +
          "</div>" +
          '<div class="activity-amount ' + (isCredit ? "credit" : "debit") + '">' +
          (isCredit ? "+" : "-") + window.AmoyniUI.formatNumber(t.amount) +
          "</div></div>"
        );
      })
      .join("");
  }

  async function loadTransactions(group) {
    listEl.innerHTML = '<div class="skeleton skeleton-card mb-2"></div><div class="skeleton skeleton-card mb-2"></div>';
    try {
      const list = await window.AmoyniAPI.call("get_my_transactions", { p_user_id: session.user_id, p_group: group });
      renderList(list);
    } catch (err) {
      listEl.innerHTML = '<div class="state-block state-error"><div class="state-title">تعذّر تحميل الحركات</div></div>';
    }
  }

  document.getElementById("wallet-filters").addEventListener("click", function (e) {
    const btn = e.target.closest("button[data-group]");
    if (!btn) return;
    document.querySelectorAll("#wallet-filters button").forEach(function (b) {
      b.classList.remove("is-active");
    });
    btn.classList.add("is-active");
    loadTransactions(btn.dataset.group);
  });

  async function init() {
    try {
      const wallet = await window.AmoyniAPI.call("get_my_wallet", { p_user_id: session.user_id });
      document.getElementById("stat-balance").textContent = window.AmoyniUI.formatNumber(wallet.current_balance);
      document.getElementById("stat-earned").textContent = window.AmoyniUI.formatNumber(wallet.total_earned);
      document.getElementById("stat-donated").textContent = window.AmoyniUI.formatNumber(wallet.total_donated);
      document.getElementById("stat-received").textContent = window.AmoyniUI.formatNumber(wallet.total_received);
      renderList(wallet.recent_transactions);
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    }
  }
  init();
})();
