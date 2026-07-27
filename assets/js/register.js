(function () {
  window.AmoyniSession.redirectIfYouthLoggedIn("dashboard.html");

  const form = document.getElementById("register-form");
  const avatarGrid = document.getElementById("avatar-grid");
  const submitBtn = document.getElementById("register-submit");
  let selectedAvatarId = null;

  // Pre-fill referral code from ?ref=CODE in the URL, if a friend shared a link
  const params = new URLSearchParams(window.location.search);
  if (params.get("ref")) {
    document.getElementById("referral_code").value = params.get("ref").toUpperCase();
  }

  async function loadAvatars() {
    try {
      const avatars = await window.AmoyniAPI.selectTable("avatars", {
        select: "id,name,image_url",
        order: { column: "sort_order", ascending: true },
      });
      avatarGrid.innerHTML = "";
      avatars.forEach(function (a, idx) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "avatar avatar-md avatar-pick";
        btn.dataset.avatarId = a.id;
        btn.innerHTML = '<img src="' + a.image_url + '" alt="' + window.AmoyniUI.escapeHtml(a.name) + '">';
        btn.addEventListener("click", function () {
          avatarGrid.querySelectorAll(".avatar-pick").forEach(function (b) {
            b.classList.remove("is-selected");
          });
          btn.classList.add("is-selected");
          selectedAvatarId = a.id;
        });
        avatarGrid.appendChild(btn);
        if (idx === 0) btn.click();
      });
    } catch (err) {
      avatarGrid.innerHTML = '<div class="text-sm text-muted">تعذّر تحميل الصور الرمزية</div>';
    }
  }
  loadAvatars();

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    window.AmoyniValidate.clearAllErrors(form);

    const fullName = document.getElementById("full_name").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const password = document.getElementById("password").value;
    const passwordConfirm = document.getElementById("password_confirm").value;
    const birthDate = document.getElementById("birth_date").value || null;
    const grade = document.getElementById("grade").value;
    const referralCode = document.getElementById("referral_code").value.trim().toUpperCase() || null;

    let hasError = false;
    if (!window.AmoyniValidate.isRequired(fullName)) {
      window.AmoyniValidate.setFieldError(document.getElementById("field-full_name"), "الاسم مطلوب");
      hasError = true;
    }
    if (!window.AmoyniValidate.isPhone(phone)) {
      window.AmoyniValidate.setFieldError(document.getElementById("field-phone"), "رقم هاتف مصري غير صحيح");
      hasError = true;
    }
    if (!window.AmoyniValidate.isMinLength(password, 6)) {
      window.AmoyniValidate.setFieldError(document.getElementById("field-password"), "6 خانات على الأقل");
      hasError = true;
    }
    if (password !== passwordConfirm) {
      window.AmoyniValidate.setFieldError(document.getElementById("field-password_confirm"), "كلمتا المرور غير متطابقتين");
      hasError = true;
    }
    if (!grade) {
      window.AmoyniValidate.setFieldError(document.getElementById("field-grade"), "اختر الصف الدراسي");
      hasError = true;
    }
    if (hasError) return;

    window.AmoyniUI.setButtonLoading(submitBtn, true);
    try {
      const data = await window.AmoyniAPI.call("register_youth_user", {
        p_phone: phone,
        p_full_name: fullName,
        p_password: password,
        p_birth_date: birthDate,
        p_grade: grade,
        p_avatar_id: selectedAvatarId,
        p_referral_code: referralCode,
      });
      // Log them straight in (fresh accounts activate immediately, no approval step)
      const loginData = await window.AmoyniAPI.call("youth_login", { p_phone: phone, p_password: password });
      window.AmoyniSession.setYouth(loginData, true);
      window.AmoyniUI.toast("تم إنشاء حسابك بنجاح، أهلاً بيك في Amoyni!", "success");
      window.location.href = "dashboard.html";
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    } finally {
      window.AmoyniUI.setButtonLoading(submitBtn, false);
    }
  });
})();
