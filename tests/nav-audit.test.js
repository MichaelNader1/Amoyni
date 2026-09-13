"use strict";

// Frontend UX / navigation audit fixtures (Phase 17).
// These check real wiring in the shipped HTML/JS files so the audit fixes
// don't silently regress: nav integrity, button-to-handler pairing, state
// controls, escaping, and the shared modal confirm ordering.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const YOUTH_PAGES = [
  "index.html", "login.html", "register.html", "dashboard.html", "scanner.html",
  "wallet.html", "leaderboard.html", "voucher.html", "donations.html",
  "shop.html", "attendance-history.html", "profile.html",
];
const ADMIN_PAGES = [
  "admin/index.html", "admin/login.html", "admin/meetings.html", "admin/meeting-details.html",
  "admin/meeting-create.html", "admin/users.html", "admin/user-details.html",
  "admin/points.html", "admin/vouchers.html", "admin/referrals.html",
  "admin/donations.html", "admin/shop.html", "admin/leaderboard.html",
  "admin/reports.html", "admin/audit-log.html", "admin/settings.html",
];

const localHrefs = (html) => {
  const out = [];
  const re = /\bhref="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (/^(#|https?:|\/|mailto:|tel:|javascript:)/.test(href)) continue;
    out.push(href.split(/[?#]/)[0]);
  }
  return out;
};

const htmlElements = {};

// =====================================================================
// A. NAVIGATION INTEGRITY — every local link resolves to a real file
// =====================================================================

test("every local href across youth and admin pages resolves to an existing file", () => {
  const missing = [];
  for (const page of YOUTH_PAGES.concat(ADMIN_PAGES)) {
    const html = read(page);
    htmlElements[page] = html;
    const dir = path.dirname(page);
    for (const href of localHrefs(html)) {
      const target = path.resolve(root, dir, href);
      if (!fs.existsSync(target)) missing.push(page + " -> " + href);
    }
  }
  assert.deepEqual(missing, []);
});

test("youth pages all carry the shared bottom navigation", () => {
  for (const page of ["dashboard.html", "wallet.html", "leaderboard.html", "profile.html", "shop.html", "voucher.html", "donations.html", "attendance-history.html"]) {
    const html = read(page);
    assert.match(html, /class="bottom-nav"/, page + " missing bottom-nav");
    assert.match(html, /href="scanner\.html"/, page + " missing scanner FAB");
  }
});

test("youth primary auth + landing screens redirect unresolved users to login", () => {
  const auth = read("assets/js/auth.js");
  assert.match(auth, /requireYouth\(/);
  assert.match(auth, /login\.html/);
  const login = read("assets/js/login.js");
  assert.match(login, /redirectIfYouthLoggedIn\("dashboard\.html"\)/);
});

// =====================================================================
// B. ADMIN NAV — sidebar mounted from one source of truth
// =====================================================================

test("admin pages mount the shared admin nav and its entries are real pages", () => {
  const nav = read("assets/js/admin/nav.js");
  for (const entry of ["dashboard", "meetings", "users", "points", "vouchers", "referrals", "donations", "shop", "leaderboard", "reports", "audit-log", "settings"]) {
    assert.match(nav, new RegExp('"?' + entry));
  }
  for (const page of ADMIN_PAGES) {
    if (page === "admin/login.html") continue;
    const html = read(page);
    assert.match(html, /assets\/js\/admin\/nav\.js/, page + " missing admin nav script");
    assert.match(html, /id="admin-sidebar"/, page + " missing sidebar mount point");
  }
});

// =====================================================================
// C. BUTTONS -> HANDLERS — no silent buttons
// =====================================================================

test("admin data-action buttons have matching javascript listeners", () => {
  const shop = read("assets/js/admin/shop.js");
  assert.match(shop, /data-availability/);
  assert.match(shop, /toggleAvailability\(/);
  assert.match(shop, /data-deliver/);
  assert.match(shop, /toggleDelivered\(/);

  const vouchers = read("assets/js/admin/vouchers.js");
  assert.match(vouchers, /data-pause/);
  assert.match(vouchers, /data-activate/);
  assert.match(vouchers, /setStatus\(/);

  const donations = read("assets/js/admin/donations.js");
  assert.match(donations, /data-view/);
  assert.match(donations, /viewTransactions\(/);
  assert.match(donations, /data-close/);
});

test("youth buy button is guarded so double submissions cannot happen", () => {
  const shop = read("assets/js/shop.js");
  assert.match(shop, /if \(buying\) return;/);
  assert.match(shop, /buying = true;/);
  assert.match(shop, /buying = false;/);
});

test("login and register submit handlers cannot fire twice while in flight", () => {
  assert.match(read("assets/js/login.js"), /submitting = true;/);
  assert.match(read("assets/js/register.js"), /submitting = true;/);
  assert.match(read("assets/js/login.js"), /submitting = false;/);
  assert.match(read("assets/js/register.js"), /submitting = false;/);
});

// =====================================================================
// D. MEETING STATE CONTROLS — draft/active/closed rendering
// =====================================================================

test("meeting details QR section is hidden once the meeting is not active", () => {
  const js = read("assets/js/admin/meeting-details.js");
  assert.match(js, /qr-section/);
  assert.match(js, /m\.status === "active" && m\.qr_token \? "block" : "none"/);
});

test("meeting point rules are editable only while the meeting is a draft", () => {
  const js = read("assets/js/admin/meeting-details.js");
  assert.match(js, /add-rule-form/);
  assert.match(js, /display = m\.status === "draft" \? "block" : "none"/);
});

test("meeting-create is reachable from the meetings list", () => {
  const html = read("admin/meetings.html");
  assert.match(html, /href="meeting-create\.html"/);
});

test("meeting details add-rule validates range and prevents end <= start", () => {
  const js = read("assets/js/admin/meeting-details.js");
  assert.match(js, /new Date\(end\) <= new Date\(start\)/);
  assert.match(js, /points < 0/);
});

test("attendance CSV export stays wired even when the list is empty", () => {
  const js = read("assets/js/admin/meeting-details.js");
  assert.match(js, /export-attendance-btn/);
  assert.match(js, /لا يوجد حضور لتصديره بعد/);
});

// =====================================================================
// E. SHOP FLOW — youth purchases reachable and limits reflect history
// =====================================================================

test("youth shop loads balance, public products and own purchase history", () => {
  const js = read("assets/js/shop.js");
  assert.match(js, /get_my_wallet/);
  assert.match(js, /get_shop_products_public/);
  assert.match(js, /get_my_shop_purchases/);
  assert.match(js, /window\.__shopOwnPurchases = list \|\| \[\]/);
  assert.match(js, /purchaseCountsByProduct\(\)/);
});

test("dashboard maps shop purchases to a friendly Arabic label", () => {
  const js = read("assets/js/dashboard.js");
  assert.match(js, /shop_purchase: "شراء من المتجر"/);
});

test("shop page and admin shop page are both linked from navigation", () => {
  assert.match(read("dashboard.html"), /href="shop\.html"/);
  const nav = read("assets/js/admin/nav.js");
  assert.match(nav, /href\s*[:=].*shop\.html/);
});

// =====================================================================
// F. SHARED MODAL BEHAVIOUR — onConfirm runs before the overlay closes
// =====================================================================

test("openModal invokes the confirm callback before closing the overlay", () => {
  const js = read("assets/js/utils.js");
  assert.match(js, /if \(opts\.onConfirm\) opts\.onConfirm\(\);\s*\n\s*close\(\)/);
  assert.match(js, /return \{ close, overlay \};/);
});

test("admin modals that run an RPC guard against double confirms", () => {
  const shop = read("assets/js/admin/shop.js");
  const vouchers = read("assets/js/admin/vouchers.js");
  const donations = read("assets/js/admin/donations.js");
  for (const js of [shop, vouchers, donations]) {
    assert.match(js, /if \(saving\) return;/);
    assert.match(js, /setButtonLoading\(confirmBtn, true\)/);
  }
});

// =====================================================================
// G. OUTPUT SAFETY — admin data never injected unescaped
// =====================================================================

test("admin lists escape user-controlled values", () => {
  const vouchers = read("assets/js/admin/vouchers.js");
  assert.match(vouchers, /escapeHtml\(v\.code\)/);
  assert.match(vouchers, /formatNumber\(v\.points\)/);

  const audit = read("assets/js/admin/audit-log.js");
  assert.match(audit, /escapeHtml\(r\.admin_username \|\| "—"\)/);
  assert.match(audit, /escapeHtml\(r\.action\)/);

  const reports = read("assets/js/admin/reports.js");
  assert.match(reports, /escapeHtml\(v\.code\)/);
  assert.match(reports, /escapeHtml\(r\.type\)/);
});

test("user-details renders the avatar with a broken-image fallback", () => {
  const js = read("assets/js/admin/user-details.js");
  assert.match(js, /avatarImgHtml\(profile\.avatar_image_url, profile\.full_name\)/);
});

// =====================================================================
// H. STATUS RECOVERY — admins can reactivate exhausted vouchers
// =====================================================================

test("vouchers can be reactivated from both paused and exhausted states", () => {
  const js = read("assets/js/admin/vouchers.js");
  assert.match(js, /v\.status === "paused" \|\| v\.status === "exhausted"/);
  assert.match(js, /data-activate/);
});

// =====================================================================
// I. EMPTY STATES — admin reports degrade gracefully
// =====================================================================

test("report tabs render dedicated empty states instead of blank tables", () => {
  const js = read("assets/js/admin/reports.js");
  assert.match(js, /لا توجد اجتماعات بعد/);
  assert.match(js, /لا توجد عمليات بعد/);
  assert.match(js, /لا توجد أكواد بعد/);
  assert.match(js, /لا توجد تبرعات بعد/);
});

// =====================================================================
// J. DEAD CONTROLS — archived meeting filter removed from the list
// =====================================================================

test("meetings list no longer offers a status filter the backend cannot produce", () => {
  const html = read("admin/meetings.html");
  assert.match(html, /value="draft"/);
  assert.match(html, /value="closed"/);
  assert.doesNotMatch(html, /value="archived"/);
});

// =====================================================================
// K. LEGACY ARCHITECTURE — audit fixes never introduced the abandoned
//    token-session migration
// =====================================================================

test("none of the audited frontend files reference the abandoned session tokens", () => {
  const files = [
    "assets/js/utils.js", "assets/js/shop.js", "assets/js/dashboard.js",
    "assets/js/login.js", "assets/js/register.js", "assets/js/profile.js",
    "assets/js/admin/shop.js", "assets/js/admin/vouchers.js",
    "assets/js/admin/donations.js", "assets/js/admin/audit-log.js",
    "assets/js/admin/user-details.js", "assets/js/admin/meeting-details.js",
    "assets/js/admin/reports.js",
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), /session_token/, file + " references session_token");
  }
});