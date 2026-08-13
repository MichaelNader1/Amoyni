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

  function isSessionError(error) {
    const raw = (error && (error.message || error.details)) || "";
    return error && (error.code === "AM001" || error.code === "AM010" || /UNAUTHENTICATED|UNAUTHORIZED/.test(raw));
  }

  async function handleDecodedText(decodedText) {
    if (!lifecycle.beginDetection(decodedText, Date.now())) return;
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
        p_session_token: session.session_token,
        p_meeting_id: parsed.value.meeting_id,
        p_qr_token: parsed.value.qr_token,
      });
      lifecycle.markSuccess();
      renderSuccess(result);
    } catch (error) {
      lifecycle.markError();
      if (isSessionError(error)) {
        window.AmoyniSession.clearYouth();
        showStatus(window.AmoyniUI.friendlyAttendanceError(error), "error", false);
        scanStatus.insertAdjacentHTML("beforeend", '<a class="btn btn-primary btn-block mt-3" href="login.html">تسجيل الدخول</a>');
      } else {
        showStatus(window.AmoyniUI.friendlyAttendanceError(error), "error", true);
      }
    }
  }

  function renderSuccess(result) {
    scanView.style.display = "none";
    successView.style.display = "block";
    document.getElementById("points-awarded").textContent = "+" + window.AmoyniUI.formatNumber(result.points_awarded || 0);
    document.getElementById("new-balance").textContent = window.AmoyniUI.formatNumber(result.balance_after || 0);
    document.getElementById("new-streak").textContent = result.streak || 0;

    const raffleState = window.AmoyniQR.raffleState(result);
    if (raffleState === "assigned") {
      document.getElementById("raffle-block").style.display = "block";
      document.getElementById("raffle-number").textContent = "#" + result.raffle_number;
    } else if (raffleState === "exhausted") {
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
