(function () {
  const session = window.AmoyniSession.requireYouth("login.html");
  if (!session) return;

  const podiumEl = document.getElementById("podium");
  const restEl = document.getElementById("rest-list");

  function avatarImg(avatarMap, avatarId) {
    const url = avatarMap[avatarId];
    return url ? '<img src="' + url + '" alt="">' : "";
  }

  function renderPodium(top3, avatarMap) {
    const order = [top3[1], top3[0], top3[2]].filter(Boolean); // visual order: 2nd,1st,3rd
    podiumEl.innerHTML = order
      .map(function (u) {
        if (!u) return "";
        const isFirst = u.rank === 1;
        return (
          '<div class="podium-slot rank-' + u.rank + '">' +
          (isFirst ? '<div class="podium-crown">👑</div>' : "") +
          '<div class="avatar ' + (isFirst ? "avatar-lg" : "avatar-md") + ' avatar-framed">' +
          avatarImg(avatarMap, u.avatar_id) +
          "</div>" +
          '<div class="podium-name">' + window.AmoyniUI.escapeHtml(u.full_name) + "</div>" +
          '<div class="podium-points">' + window.AmoyniUI.formatNumber(u.current_balance) + " نقطة</div>" +
          '<div class="podium-base">' + u.rank + "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderRest(rest, avatarMap) {
    if (!rest.length) {
      restEl.innerHTML = "";
      return;
    }
    restEl.innerHTML = rest
      .map(function (u) {
        const mine = u.user_id === session.user_id ? " style=\"border:2px solid var(--color-blue);\"" : "";
        return (
          '<div class="leaderboard-row"' + mine + ">" +
          '<div class="leaderboard-rank">' + u.rank + "</div>" +
          '<div class="avatar avatar-sm">' + avatarImg(avatarMap, u.avatar_id) + "</div>" +
          '<div style="flex:1;">' +
          '<div class="font-bold text-sm">' + window.AmoyniUI.escapeHtml(u.full_name) + "</div>" +
          '<div class="text-xs text-muted">' + (u.grade || "") + "</div>" +
          "</div>" +
          '<div class="font-bold">' + window.AmoyniUI.formatNumber(u.current_balance) + "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  async function init() {
    try {
      const [leaderboard, avatars] = await Promise.all([
        window.AmoyniAPI.call("get_leaderboard", {}),
        window.AmoyniAPI.selectTable("avatars", { select: "id,image_url" }),
      ]);
      const avatarMap = {};
      avatars.forEach(function (a) {
        avatarMap[a.id] = a.image_url;
      });

      if (!leaderboard.length) {
        podiumEl.innerHTML = "";
        restEl.innerHTML = '<div class="state-block"><div class="state-title">لا يوجد بيانات كافية بعد</div></div>';
        return;
      }

      renderPodium(leaderboard.slice(0, 3), avatarMap);
      renderRest(leaderboard.slice(3), avatarMap);
    } catch (err) {
      restEl.innerHTML = '<div class="state-block state-error"><div class="state-title">تعذّر تحميل الترتيب</div></div>';
    }
  }
  init();
})();
