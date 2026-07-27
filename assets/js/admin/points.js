(function () {
  const admin = window.AmoyniAdminNav.mount("points", "النقاط");
  if (!admin) return;

  let selectedUser = null;
  let debounceTimer = null;

  document.getElementById("user-search").addEventListener("input", function (e) {
    clearTimeout(debounceTimer);
    const q = e.target.value.trim();
    const results = document.getElementById("search-results");
    if (q.length < 2) {
      results.innerHTML = "";
      return;
    }
    debounceTimer = setTimeout(async function () {
      try {
        const rows = await window.AmoyniAPI.call("get_admin_users", { p_search: q, p_limit: 6 });
        results.innerHTML = rows
          .map(function (u) {
            return (
              '<div class="flex justify-between items-center" data-pick="' + u.id + '" style="padding:8px;border-radius:8px;cursor:pointer;" onmouseover="this.style.background=\'var(--color-surface-alt)\'" onmouseout="this.style.background=\'\'">' +
              "<span>" + window.AmoyniUI.escapeHtml(u.full_name) + " — " + u.phone + "</span>" +
              '<span class="text-muted text-sm">' + window.AmoyniUI.formatNumber(u.current_balance) + "</span></div>"
            );
          })
          .join("");
        results.querySelectorAll("[data-pick]").forEach(function (el, idx) {
          el.addEventListener("click", function () {
            selectUser(rows[idx]);
            results.innerHTML = "";
            document.getElementById("user-search").value = "";
          });
        });
      } catch (err) {
        /* ignore */
      }
    }, 300);
  });

  function selectUser(u) {
    selectedUser = u;
    document.getElementById("selected-user-block").style.display = "block";
    document.getElementById("selected-user-card").innerHTML =
      '<div class="flex justify-between items-center">' +
      '<div><div class="font-bold">' + window.AmoyniUI.escapeHtml(u.full_name) + "</div><div class=\"text-sm text-muted\">" + u.phone + "</div></div>" +
      '<div class="font-bold">' + window.AmoyniUI.formatNumber(u.current_balance) + " نقطة</div></div>";
  }

  document.getElementById("adjust-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!selectedUser) return;
    const direction = document.getElementById("adjust-direction").value;
    const amount = parseInt(document.getElementById("adjust-amount").value, 10);
    const reason = document.getElementById("adjust-reason").value.trim();
    if (!amount || amount <= 0) {
      window.AmoyniUI.toast("اكتب عدد نقط صحيح", "error");
      return;
    }
    if (!reason) {
      window.AmoyniUI.toast("السبب مطلوب", "error");
      return;
    }
    const btn = document.getElementById("adjust-submit");
    window.AmoyniUI.setButtonLoading(btn, true);
    try {
      const result = await window.AmoyniAPI.call("create_point_adjustment", {
        p_admin_id: admin.admin_id,
        p_user_id: selectedUser.id,
        p_amount: amount,
        p_direction: direction,
        p_reason: reason,
      });
      window.AmoyniUI.toast("تم التنفيذ، الرصيد الجديد: " + result.balance_after, "success");
      selectedUser.current_balance = result.balance_after;
      selectUser(selectedUser);
      document.getElementById("adjust-amount").value = "";
      document.getElementById("adjust-reason").value = "";
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    } finally {
      window.AmoyniUI.setButtonLoading(btn, false);
    }
  });
})();
