// =====================================================================
// Amoyni — Youth Shop (browse products, buy with points, own history)
// Purchases go through the single atomic RPC `purchase_shop_product`.
// =====================================================================
(function () {
  const session = window.AmoyniSession.requireYouth("login.html");
  if (!session) return;

  const core = window.AmoyniShopCore;
  const productsEl = document.getElementById("products-list");
  const purchasesEl = document.getElementById("purchases-list");
  const balanceValueEl = document.querySelector(".shop-balance-hero .hero-balance");

  let balance = 0;
  let products = [];

  function renderBalance() {
    balanceValueEl.innerHTML = window.AmoyniUI.formatNumber(balance) + '<span class="hero-balance-unit"> نقطة</span>';
  }

  function updateBalanceLocally(value) {
    balance = value;
    renderBalance();
    window.AmoyniSession.updateYouth({ current_balance: value });
  }

  function productMarkup(p, state) {
    const price = window.AmoyniUI.formatNumber(p.price_points);
    const html =
      '<div class="card product-card">' +
      '<div class="product-media">' + core.productImageHtml(p.image_url, p.name) + "</div>" +
      '<div class="product-body">' +
      '<div class="flex items-center justify-between gap-2 mb-1">' +
      '<div class="font-bold product-name">' + window.AmoyniUI.escapeHtml(p.name) + "</div>" +
      '<span class="badge ' + state.badgeClass + '">' + state.label + "</span>" +
      "</div>" +
      (p.description
        ? '<p class="text-sm text-muted product-desc">' + window.AmoyniUI.escapeHtml(p.description) + "</p>"
        : "") +
      '<div class="product-price">' + price + ' <span class="text-xs text-muted">نقطة</span></div>' +
      (p.max_per_user ? '<div class="text-xs text-muted">الحد الأقصى للشراء: ' + p.max_per_user + "</div>" : "") +
      "</div>" +
      '<div class="product-footer">' +
      (state.buyable
        ? '<button class="btn btn-primary btn-block btn-sm" data-buy="' + p.id + '"><span class="btn-label">شراء</span></button>'
        : '<button class="btn btn-secondary btn-block btn-sm" disabled>' + state.label + "</button>") +
      "</div></div>";
    return html;
  }

  function renderProducts(list) {
    products = list || [];
    if (!products.length) {
      productsEl.innerHTML = '<div class="state-block"><div class="state-title">لا توجد منتجات متاحة حاليًا</div></div>';
      return;
    }
    const countByProduct = purchaseCountsByProduct();
    productsEl.innerHTML = products
      .map(function (p) {
        return productMarkup(p, core.computeProductState(p, { balance: balance, purchasedCount: countByProduct[p.id] || 0 }));
      })
      .join("");
    productsEl.querySelectorAll("[data-buy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const product = products.find(function (p) { return p.id === btn.dataset.buy; });
        if (product) openBuyConfirm(product);
      });
    });
  }

  function purchaseCountsByProduct() {
    const map = {};
    (window.__shopOwnPurchases || []).forEach(function (pu) {
      map[pu.product_id] = (map[pu.product_id] || 0) + 1;
    });
    return map;
  }

  // ----- Buy flow ----------------------------------------------------
  function openBuyConfirm(product) {
    const state = core.computeProductState(product, { balance: balance });
    if (!state.buyable) {
      window.AmoyniUI.toast(state.label, "warning");
      return;
    }
    window.AmoyniUI.openModal({
      title: "تأكيد الشراء",
      bodyHtml:
        '<div class="confirm-buy">' +
        '<div class="font-bold text-lg mb-1">' + window.AmoyniUI.escapeHtml(product.name) + "</div>" +
        '<div class="text-sm text-muted mb-1">' + window.AmoyniUI.formatNumber(product.price_points) + " نقطة</div>" +
        "<div>هل تريد شراء هذا المنتج؟</div>" +
        "</div>",
      confirmLabel: "تأكيد الشراء",
      confirmClass: "btn-primary",
      cancelLabel: "إلغاء",
      onConfirm: function () { doBuy(product); },
    });
  }

  async function doBuy(product) {
    try {
      const result = await window.AmoyniAPI.call("purchase_shop_product", {
        p_user_id: session.user_id,
        p_product_id: product.id,
      });
      updateBalanceLocally(result.balance_after);
      window.AmoyniUI.toast("تم شراء «" + result.product_name + "» بنجاح! 🎉", "success");
      window.AmoyniFX.fireCelebration();
      loadProducts();
      loadHistory();
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
      loadProducts();
    }
  }

  // ----- History -----------------------------------------------------
  function renderHistory(list) {
    if (!list || !list.length) {
      purchasesEl.innerHTML = '<div class="state-block" style="padding:var(--space-6) 0;"><div class="state-title" style="font-size:var(--fs-md);">لم تشترِ أي مكافأة بعد</div></div>';
      return;
    }
    window.__shopOwnPurchases = list;
    purchasesEl.innerHTML = list
      .map(function (pu) {
        return (
          '<div class="activity-item">' +
          '<div class="purchase-thumb">' + core.productImageHtml(pu.product_image_snapshot, pu.product_name_snapshot) + "</div>" +
          '<div style="flex:1;min-width:0;">' +
          '<div class="font-bold text-sm">' + window.AmoyniUI.escapeHtml(pu.product_name_snapshot) + "</div>" +
          '<div class="text-xs text-muted">' + window.AmoyniUI.formatDateTime(pu.purchased_at) + "</div>" +
          "</div>" +
          '<div class="activity-amount debit">-' + window.AmoyniUI.formatNumber(pu.price_points) + "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  async function loadHistory() {
    try {
      const list = await window.AmoyniAPI.call("get_my_shop_purchases", { p_user_id: session.user_id });
      renderHistory(list);
    } catch (err) {
      purchasesEl.innerHTML = '<div class="state-block state-error"><div class="state-title">تعذّر تحميل مشترياتك</div></div>';
    }
  }

  // ----- Products ----------------------------------------------------
  async function loadProducts() {
    try {
      const list = await window.AmoyniAPI.call("get_shop_products_public", {});
      renderProducts(list);
    } catch (err) {
      productsEl.innerHTML = '<div class="state-block state-error"><div class="state-title">تعذّر تحميل المنتجات</div></div>';
    }
  }

  async function init() {
    try {
      const wallet = await window.AmoyniAPI.call("get_my_wallet", { p_user_id: session.user_id });
      balance = wallet.current_balance;
      renderBalance();
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    }
    loadProducts();
    loadHistory();
  }
  init();
})();