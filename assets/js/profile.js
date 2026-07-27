(function () {
  const session = window.AmoyniSession.requireYouth("login.html");
  if (!session) return;

  let selectedAvatarId = session.avatar_id;
  let avatarsCache = [];

  function renderAvatarGrid() {
    const grid = document.getElementById("avatar-grid");
    grid.innerHTML = "";
    avatarsCache.forEach(function (a) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "avatar avatar-md avatar-pick" + (a.id === selectedAvatarId ? " is-selected" : "");
      btn.innerHTML = '<img src="' + a.image_url + '" alt="">';
      btn.addEventListener("click", function () {
        selectedAvatarId = a.id;
        grid.querySelectorAll(".avatar-pick").forEach(function (b) {
          b.classList.remove("is-selected");
        });
        btn.classList.add("is-selected");
      });
      grid.appendChild(btn);
    });
  }

  async function init() {
    try {
      const [profile, settings, avatars] = await Promise.all([
        window.AmoyniAPI.call("get_my_profile", { p_user_id: session.user_id }),
        window.AmoyniAPI.call("get_public_settings", {}),
        window.AmoyniAPI.selectTable("avatars", { select: "id,image_url", order: { column: "sort_order", ascending: true } }),
      ]);
      avatarsCache = avatars;

      document.getElementById("profile-name").textContent = profile.full_name;
      document.getElementById("profile-phone").textContent = profile.phone;
      document.getElementById("full_name").value = profile.full_name;
      document.getElementById("grade").value = profile.grade;
      if (profile.avatar_image_url) {
        document.getElementById("profile-avatar").innerHTML = '<img src="' + profile.avatar_image_url + '" alt="">';
      }
      selectedAvatarId = profile.avatar_id;
      renderAvatarGrid();

      if (settings.referral_enabled && profile.referral_code) {
        document.getElementById("referral-card").style.display = "block";
        document.getElementById("referral-message").textContent =
          settings.referral_message || "ادعُ صديقك بالكود ده وخدوا نقط لما يحضر أول اجتماع له!";
        document.getElementById("referral-code-display").value = profile.referral_code;
      }
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    }
  }
  init();

  document.getElementById("copy-referral-btn").addEventListener("click", function () {
    const input = document.getElementById("referral-code-display");
    input.select();
    navigator.clipboard && navigator.clipboard.writeText(input.value);
    window.AmoyniUI.toast("تم نسخ الكود", "success");
  });

  document.getElementById("profile-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const form = e.target;
    window.AmoyniValidate.clearAllErrors(form);
    const fullName = document.getElementById("full_name").value.trim();
    const grade = document.getElementById("grade").value;
    if (!window.AmoyniValidate.isRequired(fullName)) {
      window.AmoyniValidate.setFieldError(document.getElementById("field-full_name"), "الاسم مطلوب");
      return;
    }
    const btn = document.getElementById("save-profile-btn");
    window.AmoyniUI.setButtonLoading(btn, true);
    try {
      const updated = await window.AmoyniAPI.call("update_own_profile", {
        p_user_id: session.user_id,
        p_full_name: fullName,
        p_grade: grade,
        p_avatar_id: selectedAvatarId,
      });
      window.AmoyniSession.updateYouth({ full_name: updated.full_name, grade: updated.grade, avatar_id: updated.avatar_id });
      document.getElementById("profile-name").textContent = updated.full_name;
      if (updated.avatar_image_url) {
        document.getElementById("profile-avatar").innerHTML = '<img src="' + updated.avatar_image_url + '" alt="">';
      }
      window.AmoyniUI.toast("تم حفظ التعديلات", "success");
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    } finally {
      window.AmoyniUI.setButtonLoading(btn, false);
    }
  });

  document.getElementById("logout-btn").addEventListener("click", function () {
    window.AmoyniUI.confirmAction("تسجيل الخروج", "هل أنت متأكد من تسجيل الخروج؟", function () {
      window.AmoyniSession.youthLogout("login.html");
    });
  });
})();
