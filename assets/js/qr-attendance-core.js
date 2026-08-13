(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AmoyniQR = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TOKEN_RE = /^[0-9a-f]{32}$/i;

  function parsePayload(decodedText) {
    let value;
    try {
      value = JSON.parse(decodedText);
    } catch (error) {
      return { ok: false, error: "INVALID_JSON" };
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, error: "INVALID_OBJECT" };
    }
    if (typeof value.meeting_id !== "string" || !UUID_RE.test(value.meeting_id)) {
      return { ok: false, error: "INVALID_MEETING_ID" };
    }
    if (typeof value.qr_token !== "string" || !TOKEN_RE.test(value.qr_token)) {
      return { ok: false, error: "INVALID_TOKEN_FORMAT" };
    }
    return {
      ok: true,
      value: { meeting_id: value.meeting_id, qr_token: value.qr_token.toLowerCase() },
    };
  }

  function createScannerState(options) {
    options = options || {};
    const duplicateWindowMs = options.duplicateWindowMs || 1500;
    let state = "idle";
    let lastText = null;
    let lastDetectedAt = 0;

    return {
      getState: function () { return state; },
      beginStarting: function () {
        if (state !== "idle") return false;
        state = "starting";
        return true;
      },
      markScanning: function () {
        if (state !== "starting") return false;
        state = "scanning";
        return true;
      },
      beginDetection: function (text, detectedAt) {
        if (state !== "scanning") return false;
        const now = Number(detectedAt || Date.now());
        if (text === lastText && now - lastDetectedAt < duplicateWindowMs) return false;
        lastText = text;
        lastDetectedAt = now;
        state = "processing";
        return true;
      },
      markError: function () {
        if (state === "success") return false;
        state = "error";
        return true;
      },
      markSuccess: function () {
        state = "success";
      },
      reset: function () {
        state = "idle";
        lastText = null;
        lastDetectedAt = 0;
      },
      cleanup: function () {
        state = "idle";
      },
    };
  }

  return { parsePayload: parsePayload, createScannerState: createScannerState };
});
