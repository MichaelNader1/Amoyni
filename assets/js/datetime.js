(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AmoyniDateTime = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function toLocalDateValue(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function toLocalDateTimeValue(date) {
    return toLocalDateValue(date) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function localDateTimeToIso(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return {
    toLocalDateValue: toLocalDateValue,
    toLocalDateTimeValue: toLocalDateTimeValue,
    localDateTimeToIso: localDateTimeToIso,
  };
});
