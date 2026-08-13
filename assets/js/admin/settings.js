(function () {
  const admin = window.AmoyniAdminNav.mount("settings", "الإعدادات");
  if (!admin) return;

  async function load() {
    try {
      const s = await window.AmoyniAPI.call("get_public_settings", {});
      document.getElementById("s-app_name").value = s.app_name || "Amoyni";
      document.getElementById("s-leaderboard_limit").value = s.leaderboard_limit || 10;
      document.getElementById("s-allow_multi_device_login").checked = !!s.allow_multi_device_login;
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    }
  }

  document.getElementById("settings-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const btn = document.getElementById("settings-save");
    window.AmoyniUI.setButtonLoading(btn, true);
    try {
      await Promise.all([
        window.AmoyniAPI.call("update_app_setting", { p_admin_id: admin.admin_id, p_key: "app_name", p_value: JSON.stringify(document.getElementById("s-app_name").value.trim()) }),
        window.AmoyniAPI.call("update_app_setting", { p_admin_id: admin.admin_id, p_key: "leaderboard_limit", p_value: JSON.stringify(parseInt(document.getElementById("s-leaderboard_limit").value, 10)) }),
        window.AmoyniAPI.call("update_app_setting", { p_admin_id: admin.admin_id, p_key: "allow_multi_device_login", p_value: JSON.stringify(document.getElementById("s-allow_multi_device_login").checked) }),
      ]);
      window.AmoyniUI.toast("تم حفظ الإعدادات", "success");
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    } finally {
      window.AmoyniUI.setButtonLoading(btn, false);
    }
  });

  load();
})();
