(function () {
  const session = window.AmoyniSession.requireYouth("login.html");
  if (!session) return;

  const scanStatus = document.getElementById("scan-status");
  const scanView = document.getElementById("scan-view");
  const successView = document.getElementById("success-view");
  const tabCamera = document.getElementById("tab-camera");
  const tabUpload = document.getElementById("tab-upload");
  const cameraPanel = document.getElementById("camera-panel");
  const uploadPanel = document.getElementById("upload-panel");

  let html5Qrcode = null;
  let fileScanner = null;
  let cameraStarting = false;
  let isProcessing = false;

  function showStatus(message, type) {
    scanStatus.style.display = "block";
    scanStatus.className = "card mt-4";
    scanStatus.innerHTML =
      '<div class="flex items-center gap-2 ' + (type === "error" ? "" : "") + '">' +
      (type === "error"
        ? '<span style="color:var(--color-danger)">⚠️</span>'
        : '<span class="spinner spinner-dark" style="width:18px;height:18px;"></span>') +
      "<span class=\"text-sm\">" + window.AmoyniUI.escapeHtml(message) + "</span></div>";
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
    try {
      html5Qrcode = new Html5Qrcode("qr-reader");
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || !cameras.length) {
        showStatus("لم يتم العثور على كاميرا، جرّب رفع صورة الكود بدلًا من ذلك.", "error");
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
          /* ignore per-frame scan failures */
        }
      );
    } catch (err) {
      showStatus("تعذّر تشغيل الكاميرا. تأكد من إعطاء إذن الوصول، أو استخدم رفع صورة الكود.", "error");
    }
  }

  function initUploadTab() {
    const fileInput = document.getElementById("qr-file-input");
    document.getElementById("qr-file-trigger").addEventListener("click", function () {
      fileInput.click();
    });
    fileInput.addEventListener("change", async function () {
      const file = fileInput.files[0];
      if (!file) return;
      const scanStartedAt = new Date().toISOString();
      showStatus("جارِ قراءة الكود من الصورة...", "loading");

      await stopCamera(); // make sure the camera instance is fully idle first

      try {
        if (!fileScanner) fileScanner = new Html5Qrcode("qr-file-reader");
        const res = await fileScanner.scanFileV2(file, false);
        handleDecodedText(res.decodedText, scanStartedAt);
      } catch (e) {
        showStatus("تعذّر قراءة كود QR من هذه الصورة، جرّب صورة أوضح.", "error");
      }
      fileInput.value = "";
    });
  }

  tabCamera.addEventListener("click", function () {
    tabCamera.classList.add("is-active");
    tabUpload.classList.remove("is-active");
    cameraPanel.style.display = "block";
    uploadPanel.style.display = "none";
    hideStatus();
    if (!html5Qrcode || !html5Qrcode.isScanning) startCameraScan();
  });
  tabUpload.addEventListener("click", async function () {
    tabUpload.classList.add("is-active");
    tabCamera.classList.remove("is-active");
    cameraPanel.style.display = "none";
    uploadPanel.style.display = "block";
    hideStatus();
    await stopCamera();
  });

  initUploadTab();
  startCameraScan();
})();
