(function () {
  window.AmoyniSession.redirectIfYouthLoggedIn("dashboard.html");

  const form = document.getElementById("login-form");
  const phoneField = document.getElementById("field-phone");
  const passwordField = document.getElementById("field-password");
  const submitBtn = document.getElementById("login-submit");
  const togglePw = document.getElementById("toggle-password");
  const pwInput = document.getElementById("password");

  togglePw.addEventListener("click", function () {
    pwInput.type = pwInput.type === "password" ? "text" : "password";
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    window.AmoyniValidate.clearAllErrors(form);

    const phone = document.getElementById("phone").value.trim();
    const password = pwInput.value;
    const remember = document.getElementById("remember-me").checked;

    let hasError = false;
    if (!window.AmoyniValidate.isPhone(phone)) {
      window.AmoyniValidate.setFieldError(phoneField, "رقم هاتف مصري غير صحيح (مثال: 01012345678)");
      hasError = true;
    }
    if (!window.AmoyniValidate.isRequired(password)) {
      window.AmoyniValidate.setFieldError(passwordField, "كلمة المرور مطلوبة");
      hasError = true;
    }
    if (hasError) return;

    window.AmoyniUI.setButtonLoading(submitBtn, true);
    try {
      const data = await window.AmoyniAPI.call("youth_login", { p_phone: phone, p_password: password });
      window.AmoyniSession.setYouth(data, remember);
      window.location.href = "dashboard.html";
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    } finally {
      window.AmoyniUI.setButtonLoading(submitBtn, false);
    }
  });
})();
