// =====================================================================
// Amoyni Admin — Points Shop (product CRUD + purchase log)
// =====================================================================
(function () {
  const admin = window.AmoyniAdminNav.mount("shop", "متجر النقاط");
  if (!admin) return;

  const core = window.AmoyniShopCore;
  const productsTbody = document.getElementById("products-tbody");
  const purchasesTbody = document.getElementById("purchases-tbody");

  let products = [];
  let purchases = [];

  // ----- Tabs ---------------------------------------------------------
  document.getElementById("shop-tabs").addEventListener("click", function (e) {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    document.querySelectorAll("#shop-tabs button").forEach(function (b) {
      b.classList.remove("is-active");
    });
    btn.classList.add("is-active");
    document.getElementById("tab-products").style.display = btn.dataset.tab === "products" ? "block" : "none";
    document.getElementById("tab-purchases").style.display = btn.dataset.tab === "purchases" ? "block" : "none";
    if (btn.dataset.tab === "purchases") loadPurchases();
  });

  // ----- Products -----------------------------------------------------
  function productMarkup(p) {
    const badge =
      p.is_available && p.stock_quantity > 0
        ? '<span class="badge badge-success">متاح</span>'
        : p.stock_quantity <= 0
        ? '<span class="badge badge-neutral">نفدت الكمية</span>'
        : '<span class="badge badge-neutral">غير متاح</span>';
    return (
      "<tr>" +
      '<td data-label="الصورة">' + (p.image_url ? '<img class="product-thumb" src="' + window.AmoyniUI.escapeHtml(p.image_url) + '" alt="" onerror="this.style.display=\'none\'">' : '<span class="product-thumb product-thumb-empty">—</span>') + "</td>" +
      '<td data-label="الاسم" class="font-bold">' + window.AmoyniUI.escapeHtml(p.name) + "</td>" +
      '<td data-label="السعر">' + window.AmoyniUI.formatNumber(p.price_points) + "</td>" +
      '<td data-label="الكمية">' + window.AmoyniUI.formatNumber(p.stock_quantity) + (p.purchased_count ? ' <span class="text-xs text-muted">(بيع ' + window.AmoyniUI.formatNumber(p.purchased_count) + ")</span>" : "") + "</td>" +
      '<td data-label="الحالة">' + badge + "</td>" +
      '<td data-label="الحد الأقصى">' + (p.max_per_user ? p.max_per_user : "—") + "</td>" +
      "<td>" +
      '<div class="flex gap-2" style="justify-content:flex-end;">' +
      '<button class="btn btn-secondary btn-sm" data-edit="' + p.id + '">تعديل</button>' +
      (p.is_available
        ? '<button class="btn btn-secondary btn-sm" data-availability="' + p.id + '">إيقاف</button>'
        : '<button class="btn btn-secondary btn-sm" data-availability="' + p.id + '">تفعيل</button>') +
      "</div></td></tr>"
    );
  }

  async function loadProducts() {
    productsTbody.innerHTML = '<tr><td colspan="7"><div class="skeleton skeleton-text"></div></td></tr>';
    try {
      const rows = await window.AmoyniAPI.call("get_admin_shop_products", {});
      products = rows || [];
      if (!products.length) {
        productsTbody.innerHTML = '<tr><td colspan="7"><div class="state-block"><div class="state-title">لا توجد منتجات بعد</div></div></td></tr>';
        return;
      }
      productsTbody.innerHTML = products.map(productMarkup).join("");
      productsTbody.querySelectorAll("[data-edit]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          const product = products.find(function (p) { return p.id === btn.dataset.edit; });
          if (product) openProductModal(product);
        });
      });
      productsTbody.querySelectorAll("[data-availability]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          toggleAvailability(btn.dataset.availability);
        });
      });
    } catch (err) {
      productsTbody.innerHTML = '<tr><td colspan="7"><div class="state-block state-error"><div class="state-title">تعذّر التحميل</div></div></td></tr>';
    }
  }

  async function toggleAvailability(id) {
    const product = products.find(function (p) { return p.id === id; });
    if (!product) return;
    try {
      await window.AmoyniAPI.call("update_shop_product", {
        p_admin_id: admin.admin_id,
        p_product_id: product.id,
        p_name: product.name,
        p_description: product.description,
        p_image_url: product.image_url,
        p_price_points: product.price_points,
        p_stock_quantity: product.stock_quantity,
        p_is_available: !product.is_available,
        p_max_per_user: product.max_per_user,
      });
      window.AmoyniUI.toast(product.is_available ? "تم إيقاف المنتج" : "تم تفعيل المنتج", "success");
      loadProducts();
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    }
  }

  // ----- Product modal (create / edit) --------------------------------
  function openProductModal(product) {
    const editing = !!product;
    const p = product || {};
    const bodyHtml =
      '<div class="field" style="margin-bottom:10px;"><label class="field-label">اسم المنتج</label><input class="field-input" id="pf-name" value="' + window.AmoyniUI.escapeHtml(p.name || "") + '"><div class="field-error-text"></div></div>' +
      '<div class="field" style="margin-bottom:10px;"><label class="field-label">الوصف (اختياري)</label><textarea class="field-textarea" id="pf-desc">' + window.AmoyniUI.escapeHtml(p.description || "") + "</textarea></div>" +
      '<div class="field" style="margin-bottom:10px;"><label class="field-label">رابط الصورة (اختياري)</label><input class="field-input" id="pf-image" dir="ltr" value="' + window.AmoyniUI.escapeHtml(p.image_url || "") + '"><div class="field-hint">اربط صورة عبر رابط مباشر، أو اتركه فارغًا</div></div>' +
      '<div class="grid-1 sm-cols-2" style="gap:8px;">' +
      '<div class="field" style="margin-bottom:10px;"><label class="field-label">السعر (نقاط)</label><input class="field-input" type="number" min="0" id="pf-price" value="' + (p.price_points === undefined ? "" : p.price_points) + '"><div class="field-error-text"></div></div>' +
      '<div class="field" style="margin-bottom:10px;"><label class="field-label">الكمية المتاحة</label><input class="field-input" type="number" min="0" id="pf-stock" value="' + (p.stock_quantity === undefined ? "" : p.stock_quantity) + '"><div class="field-error-text"></div></div>' +
      "</div>" +
      '<div class="field" style="margin-bottom:10px;"><label class="field-label">الحد الأقصى لكل شاب (اختياري — فارغ = بدون حد)</label><input class="field-input" type="number" min="1" id="pf-limit" value="' + (p.max_per_user === undefined || p.max_per_user === null ? "" : p.max_per_user) + '"><div class="field-error-text"></div></div>' +
      '<div class="checkbox-row"><input type="checkbox" id="pf-available" ' + (p.is_available === undefined || p.is_available ? "checked" : "") + '><label>متاح للشراء</label></div>';

    window.AmoyniUI.openModal({
      title: editing ? "تعديل منتج" : "منتج جديد",
      bodyHtml: bodyHtml,
      confirmLabel: editing ? "حفظ التغييرات" : "إنشاء",
      cancelLabel: "إلغاء",
      onConfirm: async function () {
        const values = {
          name: document.getElementById("pf-name").value,
          description: document.getElementById("pf-desc").value.trim(),
          image_url: document.getElementById("pf-image").value.trim(),
          price_points: document.getElementById("pf-price").value,
          stock_quantity: document.getElementById("pf-stock").value,
          max_per_user: document.getElementById("pf-limit").value,
          is_available: document.getElementById("pf-available").checked,
        };
        const validation = core.validateProductInput(values);
        if (!validation.valid) {
          const map = {
            name: "pf-name",
            price_points: "pf-price",
            stock_quantity: "pf-stock",
            max_per_user: "pf-limit",
          };
          for (const key in validation.errors) {
            const field = map[key];
            if (field) {
              const fieldEl = document.getElementById(field).closest(".field");
              window.AmoyniValidate.clearFieldError(fieldEl);
              window.AmoyniValidate.setFieldError(fieldEl, validation.errors[key]);
            }
          }
          window.AmoyniUI.toast("راجع الحقول المخطئة", "error");
          const formCheck = document.body.querySelector("[data-action='confirm']");
          if (formCheck) window.AmoyniUI.setButtonLoading(formCheck, false);
          return;
        }
        const payload = {
          p_admin_id: admin.admin_id,
          p_name: values.name.trim(),
          p_description: values.description || null,
          p_image_url: values.image_url || null,
          p_price_points: Number(values.price_points),
          p_stock_quantity: Number(values.stock_quantity),
          p_is_available: values.is_available,
          p_max_per_user: values.max_per_user === "" ? null : Number(values.max_per_user),
        };
        try {
          if (editing) {
            payload.p_product_id = product.id;
            await window.AmoyniAPI.call("update_shop_product", payload);
            window.AmoyniUI.toast("تم تحديث المنتج", "success");
          } else {
            await window.AmoyniAPI.call("create_shop_product", payload);
            window.AmoyniUI.toast("تم إنشاء المنتج", "success");
          }
          loadProducts();
        } catch (err) {
          window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
        }
      },
    });
  }

  // ----- Purchase log -------------------------------------------------
  function purchaseMarkup(p) {
    const delivered = p.is_delivered;
    return (
      "<tr>" +
      '<td data-label="الشاب" class="font-bold">' + window.AmoyniUI.escapeHtml(p.youth_name) + '<div class="text-xs text-muted" dir="ltr">' + window.AmoyniUI.escapeHtml(p.youth_phone || "") + "</div></td>" +
      '<td data-label="المنتج">' + window.AmoyniUI.escapeHtml(p.product_name_snapshot) + "</td>" +
      '<td data-label="النقاط">' + window.AmoyniUI.formatNumber(p.price_points) + "</td>" +
      '<td data-label="التاريخ">' + window.AmoyniUI.formatDateTime(p.purchased_at) + "</td>" +
      '<td data-label="التسليم">' +
      '<span class="badge ' + (delivered ? "badge-success" : "badge-warning") + '">' + (delivered ? "تم التسليم" : "بانتظار التسليم") + "</span> " +
      '<button class="btn btn-secondary btn-sm" data-deliver="' + p.id + '">' + (delivered ? "إلغاء" : "تسليم") + "</button>" +
      "</td></tr>"
    );
  }

  async function loadPurchases() {
    purchasesTbody.innerHTML = '<tr><td colspan="5"><div class="skeleton skeleton-text"></div></td></tr>';
    try {
      const rows = await window.AmoyniAPI.call("get_admin_shop_purchases", {});
      purchases = rows || [];
      if (!rows || !rows.length) {
        purchasesTbody.innerHTML = '<tr><td colspan="5"><div class="state-block"><div class="state-title">لا توجد مشتريات بعد</div></div></td></tr>';
        return;
      }
      purchasesTbody.innerHTML = rows.map(purchaseMarkup).join("");
      purchasesTbody.querySelectorAll("[data-deliver]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          toggleDelivered(btn.dataset.deliver);
        });
      });
    } catch (err) {
      purchasesTbody.innerHTML = '<tr><td colspan="5"><div class="state-block state-error"><div class="state-title">تعذّر التحميل</div></div></td></tr>';
    }
  }

  async function toggleDelivered(id) {
    const current = purchases.find(function (p) { return p.id === id; });
    if (!current) return;
    const next = !current.is_delivered;
    try {
      await window.AmoyniAPI.call("admin_set_purchase_delivered", {
        p_admin_id: admin.admin_id,
        p_purchase_id: id,
        p_delivered: next,
      });
      window.AmoyniUI.toast(next ? "تم تسليم المكافأة" : "تم إلغاء حالة التسليم", "success");
      loadPurchases();
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    }
  }

  // ----- Init ---------------------------------------------------------
  document.getElementById("new-product-btn").addEventListener("click", function () {
    openProductModal(null);
  });

  loadProducts();
})();