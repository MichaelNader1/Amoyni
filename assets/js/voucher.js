(function () {
  const session = window.AmoyniSession.requireYouth("login.html");
  if (!session) return;

  const form = document.getElementById("voucher-form");
  const submitBtn = document.getElementById("redeem-submit");
  const codeField = document.getElementById("field-code");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    window.AmoyniValidate.clearAllErrors(form);
    const code = document.getElementById("voucher-code").value.trim().toUpperCase();
    if (!window.AmoyniValidate.isRequired(code)) {
      window.AmoyniValidate.setFieldError(codeField, "اكتب الكود أولاً");
      return;
    }

    window.AmoyniUI.setButtonLoading(submitBtn, true);
    try {
      const result = await window.AmoyniAPI.call("redeem_voucher", { p_user_id: session.user_id, p_code: code });
      document.getElementById("redeem-view").style.display = "none";
      document.getElementById("success-view").style.display = "block";
      document.getElementById("success-message").textContent = result.success_message || "مبروك! حصلت على نقط جديدة";
      document.getElementById("voucher-points").textContent = "+" + window.AmoyniUI.formatNumber(result.points_awarded);
      document.getElementById("voucher-new-balance").textContent = window.AmoyniUI.formatNumber(result.balance_after);
      window.AmoyniSession.updateYouth({ current_balance: result.balance_after });
      window.AmoyniFX.fireCelebration();
    } catch (err) {
      window.AmoyniValidate.setFieldError(codeField, window.AmoyniUI.friendlyError(err));
    } finally {
      window.AmoyniUI.setButtonLoading(submitBtn, false);
    }
  });

  document.getElementById("redeem-another").addEventListener("click", function () {
    document.getElementById("voucher-code").value = "";
    document.getElementById("redeem-view").style.display = "block";
    document.getElementById("success-view").style.display = "none";
  });
})();
