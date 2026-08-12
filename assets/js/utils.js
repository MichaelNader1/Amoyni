// =====================================================================
// Amoyni — Shared Utilities
// =====================================================================
window.AmoyniUI = (function () {
  // --- Toasts -----------------------------------------------------
  function ensureToastStack() {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }
    return stack;
  }

  const ICONS = {
    success:
      '<svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error:
      '<svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
    warning:
      '<svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-3.14l-8.18-14a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    info:
      '<svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  function toast(message, type) {
    type = type || "info";
    const stack = ensureToastStack();
    const el = document.createElement("div");
    el.className = "toast toast-" + type;
    el.innerHTML = (ICONS[type] || ICONS.info) + "<span>" + escapeHtml(message) + "</span>";
    stack.appendChild(el);
    setTimeout(function () {
      el.classList.add("is-leaving");
      setTimeout(function () {
        el.remove();
      }, 250);
    }, 3200);
  }

  // --- Modal (simple confirm/generic) -------------------------------
  function openModal(opts) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML =
      '<div class="modal">' +
      '<div class="modal-handle"></div>' +
      '<div class="modal-title">' + escapeHtml(opts.title || "") + "</div>" +
      '<div class="modal-body">' + (opts.bodyHtml || escapeHtml(opts.body || "")) + "</div>" +
      '<div class="modal-actions">' +
      (opts.cancelLabel
        ? '<button class="btn btn-secondary" data-action="cancel">' + escapeHtml(opts.cancelLabel) + "</button>"
        : "") +
      '<button class="btn ' + (opts.confirmClass || "btn-primary") + '" data-action="confirm">' +
      escapeHtml(opts.confirmLabel || "حسنًا") +
      "</button>" +
      "</div></div>";
    document.body.appendChild(overlay);
    requestAnimationFrame(function () {
      overlay.classList.add("is-open");
    });

    function close() {
      overlay.classList.remove("is-open");
      setTimeout(function () {
        overlay.remove();
      }, 250);
    }

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        close();
        if (opts.onCancel) opts.onCancel();
      }
    });
    overlay.querySelector('[data-action="cancel"]') &&
      overlay.querySelector('[data-action="cancel"]').addEventListener("click", function () {
        close();
        if (opts.onCancel) opts.onCancel();
      });
    overlay.querySelector('[data-action="confirm"]').addEventListener("click", function () {
      close();
      if (opts.onConfirm) opts.onConfirm();
    });

    return { close };
  }

  function confirmAction(title, body, onConfirm, opts) {
    opts = opts || {};
    openModal({
      title: title,
      body: body,
      confirmLabel: opts.confirmLabel || "تأكيد",
      cancelLabel: opts.cancelLabel || "إلغاء",
      confirmClass: opts.danger ? "btn-danger" : "btn-primary",
      onConfirm: onConfirm,
    });
  }

  // --- Page loader --------------------------------------------------
  function showPageLoader(text) {
    hidePageLoader();
    const el = document.createElement("div");
    el.className = "page-loader";
    el.id = "amoyni-page-loader";
    el.innerHTML =
      '<div class="spinner spinner-dark"></div><div class="page-loader-text">' +
      escapeHtml(text || "جارِ التحميل...") +
      "</div>";
    document.body.appendChild(el);
  }
  function hidePageLoader() {
    const el = document.getElementById("amoyni-page-loader");
    if (el) el.remove();
  }

  // --- Button loading state ------------------------------------------
  function setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.dataset.wasDisabled = btn.disabled ? "1" : "0";
      btn.disabled = true;
      btn.classList.add("is-loading");
      if (!btn.querySelector(".spinner")) {
        const sp = document.createElement("span");
        sp.className = "spinner";
        sp.style.position = "absolute";
        btn.appendChild(sp);
      }
      if (!btn.querySelector(".btn-label")) {
        const wrap = document.createElement("span");
        wrap.className = "btn-label";
        wrap.innerHTML = btn.innerHTML.replace(/<span class="spinner".*?<\/span>/, "");
      }
    } else {
      btn.classList.remove("is-loading");
      btn.disabled = btn.dataset.wasDisabled === "1";
      const sp = btn.querySelector(".spinner");
      if (sp) sp.remove();
    }
  }

  // --- Animated counter ----------------------------------------------
  function animateCounter(el, from, to, duration) {
    duration = duration || 900;
    const start = performance.now();
    const diff = to - from;
    function step(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + diff * eased).toLocaleString("ar-EG");
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = to.toLocaleString("ar-EG");
    }
    requestAnimationFrame(step);
  }

  // --- Formatting ------------------------------------------------------
  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  }
  function formatDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return (
      d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" }) +
      " - " +
      d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })
    );
  }
  function formatNumber(n) {
    return Number(n || 0).toLocaleString("ar-EG");
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --- RPC error message mapping (Arabic) -----------------------------
  const ERROR_MESSAGES = {
    PHONE_ALREADY_REGISTERED: "رقم الهاتف مسجل بالفعل، جرّب تسجيل الدخول.",
    INVALID_CREDENTIALS: "رقم الهاتف أو كلمة المرور غير صحيحة.",
    ACCOUNT_DISABLED: "هذا الحساب معطل، تواصل مع المسؤول.",
    MEETING_NOT_FOUND: "لم يتم العثور على الاجتماع.",
    MEETING_NOT_ACTIVE: "لا يوجد اجتماع نشط الآن.",
    MEETING_NOT_DRAFT: "لا يمكن التعديل بعد بدء الاجتماع.",
    INVALID_TOKEN: "كود QR غير صالح لهذا الاجتماع.",
    SCAN_TIMEOUT: "انتهت مهلة المسح (60 ثانية)، حاول مسح الكود مرة أخرى.",
    ALREADY_ATTENDED: "لقد سجلت حضورك في هذا الاجتماع بالفعل.",
    USER_NOT_FOUND: "المستخدم غير موجود.",
    VOUCHER_NOT_FOUND: "الكود غير صحيح.",
    VOUCHER_INACTIVE: "هذا الكود متوقف حاليًا.",
    VOUCHER_EXHAUSTED: "تم استخدام هذا الكود بالكامل.",
    ALREADY_REDEEMED: "لقد استخدمت هذا الكود من قبل.",
    CAMPAIGN_NOT_FOUND: "الحملة غير موجودة.",
    CAMPAIGN_CLOSED: "هذه الحملة مغلقة الآن.",
    SELF_DONATION_NOT_ALLOWED: "لا يمكنك التبرع لنفسك.",
    INSUFFICIENT_BALANCE: "رصيدك الحالي لا يكفي لإتمام هذه العملية.",
    INVALID_AMOUNT: "الرجاء إدخال قيمة صحيحة.",
    REASON_REQUIRED: "السبب مطلوب.",
    CODE_ALREADY_EXISTS: "هذا الكود مستخدم من قبل، اختر كودًا آخر.",
    PASSWORD_TOO_SHORT: "كلمة المرور يجب ألا تقل عن 6 خانات.",
    CAMPAIGN_NOT_ACTIVE: "الحملة غير نشطة.",
  };

  function friendlyError(err) {
    if (!err) return "حدث خطأ غير متوقع.";
    const raw = (err.message || err.details || "").trim();
    for (const code in ERROR_MESSAGES) {
      if (raw.indexOf(code) !== -1) return ERROR_MESSAGES[code];
    }
    if (raw) return raw;
    return "حدث خطأ غير متوقع، حاول مرة أخرى.";
  }

  // --- CSV export (UTF-8 with BOM so Excel renders Arabic correctly) ---
  function toCSV(rows, columns) {
    // columns: [{ key: 'full_name', label: 'الاسم' }, ...]
    const escapeCell = function (val) {
      const s = val === undefined || val === null ? "" : String(val);
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const header = columns.map(function (c) { return escapeCell(c.label); }).join(",");
    const body = rows
      .map(function (row) {
        return columns.map(function (c) { return escapeCell(row[c.key]); }).join(",");
      })
      .join("\n");
    return header + "\n" + body;
  }

  function downloadCSV(baseName, rows, columns) {
    const csv = toCSV(rows, columns);
    const dateStr = new Date().toISOString().slice(0, 10);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = baseName + "-" + dateStr + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // --- Avatar image rendering with a safe fallback -----------------------
  // Falls back to a simple colored initial-circle if the image URL 404s or
  // fails to load for any reason (bad path, offline, slow network, etc.)
  // so the user never sees a broken-image icon.
  function avatarImgHtml(url, altText) {
    const safeAlt = escapeHtml(altText || "");
    if (!url) return avatarFallbackHtml(altText);
    return (
      '<img src="' + escapeHtml(url) + '" alt="' + safeAlt + '" ' +
      'onerror="this.outerHTML=window.AmoyniUI.avatarFallbackHtml(\'' + safeAlt.replace(/'/g, "&#39;") + "')\">"
    );
  }
  function avatarFallbackHtml(altText) {
    const letter = (altText || "؟").trim().charAt(0).toUpperCase() || "؟";
    return (
      '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;' +
      'background:var(--gradient-primary);color:#fff;font-weight:800;">' + escapeHtml(letter) + "</div>"
    );
  }

  return {
    toast,
    openModal,
    confirmAction,
    showPageLoader,
    hidePageLoader,
    setButtonLoading,
    animateCounter,
    formatDate,
    formatDateTime,
    formatNumber,
    escapeHtml,
    friendlyError,
    toCSV,
    downloadCSV,
    avatarImgHtml,
    avatarFallbackHtml,
  };
})();
