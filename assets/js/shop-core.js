// =====================================================================
// Amoyni — Shop Core (pure, testable logic shared by youth + admin shop)
// Exposes:
//   - computeProductState(product, opts) -> display/buyability metadata
//   - validateProductInput(data)          -> admin product form validation
//   - productImageHtml(url, alt)          -> image markup with placeholder
// Works in browsers (window.AmoyniShopCore) and Node (module.exports).
// =====================================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AmoyniShopCore = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const STATE = {
    AVAILABLE: "available",
    UNSUFFICIENT: "insufficient",
    OUT_OF_STOCK: "out_of_stock",
    UNAVAILABLE: "unavailable",
    LIMIT_REACHED: "limit_reached",
  };

  const STATE_LABELS = {
    available: "متاح",
    insufficient: "رصيد غير كافٍ",
    out_of_stock: "نفدت الكمية",
    unavailable: "غير متاح",
    limit_reached: "بلغت الحد الأقصى",
  };

  const STATE_BADGES = {
    available: "badge-success",
    insufficient: "badge-warning",
    out_of_stock: "badge-neutral",
    unavailable: "badge-neutral",
    limit_reached: "badge-info",
  };

  function computeProductState(product, opts) {
    opts = opts || {};
    const balance = Number(opts.balance || 0);
    const purchasedCount = Number(opts.purchasedCount || 0);

    let key = STATE.AVAILABLE;
    if (!product.is_available) key = STATE.UNAVAILABLE;
    else if (Number(product.stock_quantity) <= 0) key = STATE.OUT_OF_STOCK;
    else if (balance < Number(product.price_points)) key = STATE.UNSUFFICIENT;
    else if (product.max_per_user != null && purchasedCount >= Number(product.max_per_user)) {
      key = STATE.LIMIT_REACHED;
    }

    return {
      key: key,
      label: STATE_LABELS[key],
      badgeClass: STATE_BADGES[key],
      buyable: key === STATE.AVAILABLE,
    };
  }

  function validateProductInput(data) {
    const errors = {};

    if (!data.name || !String(data.name).trim()) {
      errors.name = "اسم المنتج مطلوب";
    }

    const price = Number(data.price_points);
    if (data.price_points === "" || data.price_points === null || data.price_points === undefined || !Number.isFinite(price)) {
      errors.price_points = "اكتب السعر بالنقاط";
    } else if (!Number.isInteger(price) || price < 0) {
      errors.price_points = "السعر يجب أن يكون صفرًا أو أكثر";
    }

    const stock = Number(data.stock_quantity);
    if (data.stock_quantity === "" || data.stock_quantity === null || data.stock_quantity === undefined || !Number.isFinite(stock)) {
      errors.stock_quantity = "اكتب الكمية المتاحة";
    } else if (!Number.isInteger(stock) || stock < 0) {
      errors.stock_quantity = "الكمية يجب أن تكون صفرًا أو أكثر";
    }

    if (data.max_per_user !== "" && data.max_per_user !== null && data.max_per_user !== undefined) {
      const limit = Number(data.max_per_user);
      if (!Number.isInteger(limit) || limit < 1) {
        errors.max_per_user = "الحد الأقصى يجب أن يكون 1 أو أكثر";
      }
    }

    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  function escapeAttr(str) {
    return String(str === undefined || str === null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function productImageHtml(url, alt) {
    const safeAlt = escapeAttr(alt || "");
    if (!url) {
      return '<div class="shop-image-fallback">' + (safeAlt ? "<span>" + escapeAttr(safeAlt.charAt(0)) + "</span>" : "") + "</div>";
    }
    return (
      '<img class="shop-product-image" src="' + escapeAttr(url) + '" alt="' + safeAlt + '" ' +
      'onerror="this.outerHTML=window.AmoyniShopCore.productImageHtml(\'\',\'' + safeAlt.replace(/'/g, "&#39;") + '\')">'
    );
  }

  return {
    STATE: STATE,
    STATE_LABELS: STATE_LABELS,
    STATE_BADGES: STATE_BADGES,
    computeProductState: computeProductState,
    validateProductInput: validateProductInput,
    productImageHtml: productImageHtml,
  };
});