(function () {
  "use strict";

  const session = window.AmoyniSession.requireYouth("login.html");
  if (!session) return;

  const scanStatus = document.getElementById("scan-status");
  const scanView = document.getElementById("scan-view");
  const successView = document.getElementById("success-view");
  const lifecycle = window.AmoyniQR.createScannerState({ duplicateWindowMs: 1500 });
  let html5Qrcode = null;

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
    if (showRetry) document.getElementById("retry-camera-btn").addEventListener("click", resetAndStart);
  }

  function hideStatus() {
    scanStatus.style.display = "none";
  }

  async function stopCamera() {
    if (!html5Qrcode || !html5Qrcode.isScanning) return;
    try {
      await html5Qrcode.stop();
    } catch (error) {
      // The camera may already have been released by browser navigation.
    }
  }

  function invalidQrMessage() {
    return "كود QR غير صالح. امسح كود الحضور المعروض للاجتماع وحاول مرة أخرى.";
  }

  async function handleDecodedText(decodedText) {
    if (!lifecycle.beginDetection(decodedText, Date.now())) return;
    const scanStartedAt = new Date().toISOString();
    showStatus("جارِ التحقق من الكود وتسجيل الحضور...", "loading");
    await stopCamera();

    const parsed = window.AmoyniQR.parsePayload(decodedText);
    if (!parsed.ok) {
      lifecycle.markError();
      showStatus(invalidQrMessage(), "error", true);
      return;
    }

    try {
      const result = await window.AmoyniAPI.call("register_attendance", {
        p_user_id: session.user_id,
        p_meeting_id: parsed.value.meeting_id,
        p_qr_token: parsed.value.qr_token,
        p_scan_started_at: scanStartedAt,
      });
      lifecycle.markSuccess();
      renderSuccess(result);
    } catch (error) {
      lifecycle.markError();
      showStatus(window.AmoyniUI.friendlyError(error), "error", true);
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

  function cameraErrorMessage(error) {
    const name = error && error.name ? error.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "تم رفض إذن الكاميرا. اسمح للموقع باستخدام الكاميرا من إعدادات المتصفح ثم أعد المحاولة.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "لم يتم العثور على كاميرا متاحة في هذا الجهاز.";
    }
    return "تعذّر تشغيل الكاميرا. تحقق من الإذن وأن الموقع مفتوح عبر اتصال آمن ثم أعد المحاولة.";
  }

  async function startCameraScan() {
    if (!lifecycle.beginStarting()) return;
    hideStatus();
    try {
      if (!html5Qrcode) html5Qrcode = new Html5Qrcode("qr-reader");
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || !cameras.length) {
        lifecycle.markError();
        showStatus("لم يتم العثور على كاميرا في هذا الجهاز.", "error", true);
        return;
      }
      await html5Qrcode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 230, height: 230 }, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] },
        handleDecodedText,
        function () { /* Per-frame decode misses are expected. */ }
      );
      lifecycle.markScanning();
    } catch (error) {
      lifecycle.markError();
      showStatus(cameraErrorMessage(error), "error", true);
    }
  }

  async function resetAndStart() {
    await stopCamera();
    lifecycle.reset();
    startCameraScan();
  }

  function cleanup() {
    lifecycle.cleanup();
    stopCamera();
  }

  window.addEventListener("pagehide", cleanup, { once: true });
  startCameraScan();
})();
