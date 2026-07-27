// =====================================================================
// Amoyni — Form Validation Helpers
// =====================================================================
window.AmoyniValidate = (function () {
  function isRequired(value) {
    return value !== undefined && value !== null && String(value).trim().length > 0;
  }

  function isPhone(value) {
    // Egyptian mobile numbers: 01 followed by 9 digits (11 digits total)
    return /^01[0-2,5]{1}[0-9]{8}$/.test(String(value || "").trim());
  }

  function isMinLength(value, len) {
    return String(value || "").length >= len;
  }

  function setFieldError(fieldEl, message) {
    fieldEl.classList.add("has-error");
    const errEl = fieldEl.querySelector(".field-error-text");
    if (errEl) errEl.textContent = message || "";
  }

  function clearFieldError(fieldEl) {
    fieldEl.classList.remove("has-error");
    const errEl = fieldEl.querySelector(".field-error-text");
    if (errEl) errEl.textContent = "";
  }

  function clearAllErrors(formEl) {
    formEl.querySelectorAll(".field.has-error").forEach(function (f) {
      clearFieldError(f);
    });
  }

  return {
    isRequired,
    isPhone,
    isMinLength,
    setFieldError,
    clearFieldError,
    clearAllErrors,
  };
})();
