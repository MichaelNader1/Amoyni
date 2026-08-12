(function () {
  const session = window.AmoyniSession.requireYouth("login.html");
  if (!session) return;

  const scanStatus = document.getElementById("scan-status");
  const scanView = document.getElementById("scan-view");
  const successView = document.getElementById("success-view");

  let html5Qrcode = null;
  let isProcessing = false;

  function showStatus(message, type, showRetry) {
    scanStatus.style.display = "block";
    scanStatus.className = "card mt-4";
    scanStatus.innerHTML =
      '<div class="flex items-center gap-2">' +
      (type === "error"
        ? '<span style="color:var(--color-danger)">⚠️</span>'
        : '<span class="spinner spinner-dark" style="width:18px;height:18px;"></span>') +
      '<span class="text-sm">' + window.AmoyniUI.escapeHtml(message) + "</span></div>" +
      (showRetry ? '<button class="btn btn-secondary btn-block mt-3" id="retry-camera-btn">إعادة المحاولة</button>' : "");
    if (showRetry) {
      document.getElementById("retry-camera-btn").addEventListener("click", startCameraScan);
    }
  }
  function hideStatus() {
    scanStatus.style.display = "none";
  }

  async function stopCamera() {
    if (html5Qrcode && html5Qrcode.isScanning) {
      try {
        await html5Qrcode.stop();
      } catch (e) {
        /* already stopped */
      }
    }
  }

  async function handleDecodedText(decodedText, scanStartedAt) {
    if (isProcessing) return;
    isProcessing = true;
    showStatus("جارِ تسجيل الحضور...", "loading");

    let payload;
    try {
      payload = JSON.parse(decodedText);
    } catch (e) {
      showStatus("كود QR غير صالح، حاول مسح كود الاجتماع مرة أخرى.", "error");
      isProcessing = false;
      return;
    }

    try {
      const result = await window.AmoyniAPI.call("register_attendance", {
        p_user_id: session.user_id,
        p_meeting_id: payload.meeting_id,
        p_qr_token: payload.qr_token,
        p_scan_started_at: scanStartedAt,
      });
      await stopCamera();
      renderSuccess(result);
    } catch (err) {
      showStatus(window.AmoyniUI.friendlyError(err), "error");
      isProcessing = false;
      // let them try scanning again after an error (e.g. already attended, timeout)
      setTimeout(function () {
        if (!html5Qrcode || !html5Qrcode.isScanning) startCameraScan();
      }, 500);
    }
  }

  function renderSuccess(result) {
    scanView.style.display = "none";
    successView.style.display = "block";

    document.getElementById("points-awarded").textContent = "+" + window.AmoyniUI.formatNumber(result.points_awarded || 0);
    document.getElementById("new-balance").textContent = window.AmoyniUI.formatNumber(result.balance_after || 0);
    document.getElementById("new-streak").textContent = result.streak || 0;

    if (result.raffle_number) {
      document.getElementById("raffle-block").style.display = "block";
      document.getElementById("raffle-number").textContent = "#" + result.raffle_number;
    } else {
      document.getElementById("raffle-exhausted-note").style.display = "inline-flex";
    }

    const contentBlock = document.getElementById("content-block");
    const text = result.verse_text || result.announcement_text;
    if (text) {
      contentBlock.style.display = "block";
      contentBlock.textContent = text;
    }

    window.AmoyniSession.updateYouth({ current_balance: result.balance_after, current_streak: result.streak });
    window.AmoyniFX.fireCelebration();
    setTimeout(window.AmoyniFX.fireCelebration, 500);
  }

  async function startCameraScan() {
    hideStatus();
    isProcessing = false;
    try {
      if (!html5Qrcode) html5Qrcode = new Html5Qrcode("qr-reader");
      if (html5Qrcode.isScanning) return;

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || !cameras.length) {
        showStatus("لم يتم العثور على كاميرا في هذا الجهاز.", "error", true);
        return;
      }
      const scanStartedAt = new Date().toISOString();
      await html5Qrcode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        function (decodedText) {
          handleDecodedText(decodedText, scanStartedAt);
        },
        function () {
          /* ignore per-frame scan failures, this fires continuously while scanning */
        }
      );
    } catch (err) {
      showStatus("تعذّر تشغيل الكاميرا. تأكد من إعطاء إذن الوصول للكاميرا من إعدادات المتصفح.", "error", true);
    }
  }

  startCameraScan();
})();
