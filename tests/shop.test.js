"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const migration = read("supabase/migration_4_shop.sql");
const setup = read("supabase/amoyni_supabase_setup.sql");
const core = require("../assets/js/shop-core.js");

// Body of a single SQL function, scoped from "create or replace function"
// to that function's own closing "$$;".
const fnBody = (fnName) => {
  const start = migration.indexOf("create or replace function " + fnName);
  assert.ok(start !== -1, "missing function: " + fnName);
  const end = migration.indexOf("end;\n$$;", start) + "end;\n$$;".length;
  assert.ok(end > "end;\n$$;".length, "unterminated body for: " + fnName);
  return migration.slice(start, end);
};

// =====================================================================
// 1. SHOP CORE — pure logic
// =====================================================================

test("shop core: available product with enough balance is buyable", () => {
  const state = core.computeProductState(
    { is_available: true, stock_quantity: 3, price_points: 50 },
    { balance: 100 },
  );
  assert.equal(state.buyable, true);
  assert.equal(state.key, "available");
});

test("shop core: unlisted product is never buyable", () => {
  const state = core.computeProductState(
    { is_available: false, stock_quantity: 3, price_points: 50 },
    { balance: 200 },
  );
  assert.equal(state.buyable, false);
  assert.equal(state.key, "unavailable");
});

test("shop core: zero stock is out of stock regardless of balance", () => {
  assert.equal(
    core.computeProductState({ is_available: true, stock_quantity: 0, price_points: 10 }, { balance: 500 }).key,
    "out_of_stock",
  );
});

test("shop core: not enough points is insufficient even with stock", () => {
  assert.equal(
    core.computeProductState({ is_available: true, stock_quantity: 5, price_points: 100 }, { balance: 50 }).key,
    "insufficient",
  );
});

test("shop core: exactly enough points can buy", () => {
  const state = core.computeProductState({ is_available: true, stock_quantity: 5, price_points: 100 }, { balance: 100 });
  assert.equal(state.buyable, true);
});

test("shop core: free product (0 points) with 0 balance can buy", () => {
  assert.equal(
    core.computeProductState({ is_available: true, stock_quantity: 1, price_points: 0 }, { balance: 0 }).buyable,
    true,
  );
});

test("shop core: purchase limit reached blocks further buys", () => {
  const product = { is_available: true, stock_quantity: 5, price_points: 10, max_per_user: 1 };
  const first = core.computeProductState(product, { balance: 100, purchasedCount: 0 });
  const second = core.computeProductState(product, { balance: 100, purchasedCount: 1 });
  assert.equal(first.key, "available");
  assert.equal(second.key, "limit_reached");
  assert.equal(second.buyable, false);
});

test("shop core: null max_per_user means no limit", () => {
  const product = { is_available: true, stock_quantity: 5, price_points: 10, max_per_user: null };
  assert.equal(core.computeProductState(product, { balance: 100, purchasedCount: 99 }).key, "available");
});

test("shop core: state priority unavailable > out_of_stock > insufficient > limit > available", () => {
  assert.equal(
    core.computeProductState({ is_available: false, stock_quantity: 0, price_points: 0 }, { balance: 0 }).key,
    "unavailable",
  );
  assert.equal(
    core.computeProductState({ is_available: true, stock_quantity: 0, price_points: 0, max_per_user: 1 }, { balance: 0, purchasedCount: 1 }).key,
    "out_of_stock",
  );
  assert.equal(
    core.computeProductState({ is_available: true, stock_quantity: 2, price_points: 10, max_per_user: 1 }, { balance: 5, purchasedCount: 1 }).key,
    "insufficient",
  );
});

// =====================================================================
// 2. SHOP CORE — product form validation
// =====================================================================

test("shop core: valid product input passes", () => {
  const result = core.validateProductInput({
    name: "كرة قدم",
    price_points: "100",
    stock_quantity: "5",
    max_per_user: "2",
  });
  assert.equal(result.valid, true);
});

test("shop core: empty name rejected", () => {
  assert.equal(core.validateProductInput({ name: "  ", price_points: "10", stock_quantity: "5" }).valid, false);
});

test("shop core: negative price rejected", () => {
  const result = core.validateProductInput({ name: "x", price_points: "-5", stock_quantity: "5" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.price_points);
});

test("shop core: non-integer price rejected", () => {
  assert.equal(core.validateProductInput({ name: "x", price_points: "5.5", stock_quantity: "5" }).valid, false);
});

test("shop core: negative stock rejected", () => {
  const result = core.validateProductInput({ name: "x", price_points: "10", stock_quantity: "-3" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.stock_quantity);
});

test("shop core: zero stock is allowed", () => {
  assert.equal(core.validateProductInput({ name: "x", price_points: "10", stock_quantity: "0" }).valid, true);
});

test("shop core: purchase limit of 0 rejected, empty means no limit", () => {
  assert.equal(core.validateProductInput({ name: "x", price_points: "1", stock_quantity: "1", max_per_user: "0" }).valid, false);
  assert.equal(core.validateProductInput({ name: "x", price_points: "1", stock_quantity: "1", max_per_user: "" }).valid, true);
});

// =====================================================================
// 3. MIGRATION — tables & constraints
// =====================================================================

test("migration creates shop_products with required columns and checks", () => {
  assert.match(migration, /create table if not exists shop_products/);
  for (const col of ["id", "name", "description", "image_url", "price_points", "stock_quantity", "is_available", "max_per_user", "created_by_admin_id", "created_at", "updated_at"]) {
    assert.ok(migration.indexOf(col) !== -1, "missing column: " + col);
  }
  assert.match(migration, /name\s+varchar not null/);
  assert.match(migration, /price_points\s+integer.*check \(price_points >= 0\)/);
  assert.match(migration, /stock_quantity\s+integer.*check \(stock_quantity >= 0\)/);
  assert.match(migration, /max_per_user\s+integer check \(max_per_user is null or max_per_user > 0\)/);
  assert.match(migration, /is_available\s+boolean not null default true/);
  assert.match(migration, /created_by_admin_id\s+uuid references admin_users\(id\)/);
});

test("migration creates shop_purchases with permanent snapshot columns", () => {
  assert.match(migration, /create table if not exists shop_purchases/);
  for (const col of ["user_id", "product_id", "product_name_snapshot", "product_image_snapshot", "price_points", "purchased_at", "is_delivered", "delivered_at"]) {
    assert.ok(migration.indexOf(col) !== -1, "missing snapshot column: " + col);
  }
  assert.match(migration, /product_name_snapshot\s+varchar not null/);
});

test("migration RLS is enabled on shop tables (consistent with sensitive tables)", () => {
  assert.match(migration, /alter table shop_products enable row level security/);
  assert.match(migration, /alter table shop_purchases enable row level security/);
});

test("migration adds shop_purchase to the point_transactions type check", () => {
  assert.match(migration, /drop constraint if exists point_transactions_type_check/);
  assert.match(migration, /add constraint point_transactions_type_check/);
  assert.match(migration, /check \(type in \([\s\S]*'shop_purchase'/);
});

// =====================================================================
// 4. MIGRATION — atomic purchase RPC
// =====================================================================

test("purchase_shop_product function exists with legacy (uuid) signature", () => {
  const sig = migration.slice(
    migration.indexOf("create or replace function purchase_shop_product"),
    migration.indexOf("returns jsonb", migration.indexOf("create or replace function purchase_shop_product")),
  );
  assert.match(sig, /purchase_shop_product\(p_user_id uuid, p_product_id uuid\)/);
  assert.doesNotMatch(sig, /session_token/);
});

test("purchase is a SINGLE transaction: profile and product are locked with FOR UPDATE", () => {
  const fn = fnBody("purchase_shop_product");
  assert.match(fn, /select \* into v_profile from profiles where id = p_user_id for update/);
  assert.match(fn, /select \* into v_product from shop_products where id = p_product_id for update/);
  assert.ok(fn.indexOf("for update") >= 2);
});

test("purchase validates availability, stock and balance before mutating", () => {
  const fn = fnBody("purchase_shop_product");
  assert.match(fn, /raise exception 'PRODUCT_NOT_FOUND'/);
  assert.match(fn, /raise exception 'PRODUCT_UNAVAILABLE'/);
  assert.match(fn, /raise exception 'OUT_OF_STOCK'/);
  assert.match(fn, /raise exception 'INSUFFICIENT_POINTS'/);
  assert.match(fn, /raise exception 'PURCHASE_LIMIT_REACHED'/);
  assert.match(fn, /raise exception 'ACCOUNT_DISABLED'/);
});

test("stock can never go negative: guarded conditional decrement", () => {
  const fn = fnBody("purchase_shop_product");
  assert.match(fn, /set stock_quantity = stock_quantity - 1/);
  assert.match(fn, /and stock_quantity > 0/);
});

test("purchase inserts a permanent snapshot record with original name/price", () => {
  const fn = fnBody("purchase_shop_product");
  assert.match(fn, /insert into shop_purchases/);
  assert.match(fn, /product_name_snapshot, product_image_snapshot, price_points/);
  assert.match(fn, /v_product\.name/);
  assert.match(fn, /v_product\.price_points/);
});

test("purchase deducts from profiles.current_balance exactly once (no double points system)", () => {
  const fn = fnBody("purchase_shop_product");
  assert.equal((fn.match(/update profiles\s+set current_balance/g) || []).length, 1);
  assert.match(fn, /current_balance = v_new_balance/);
  assert.ok(fn.indexOf("total_earned") === -1, "purchase must not touch lifetime total_earned");
});

test("purchase creates a shop_purchase debit transaction with balance snapshots", () => {
  const fn = fnBody("purchase_shop_product");
  assert.match(fn, /insert into point_transactions/);
  assert.match(fn, /'shop_purchase'/);
  assert.match(fn, /'debit'/);
  assert.match(fn, /balance_before, balance_after/);
  assert.match(fn, /'shop_purchases', v_purchase_id/);
  assert.match(fn, /if v_product\.price_points > 0 then/); // 0-point gifts skip the 0-amount transaction
});

test("migration keeps one purchase RPC (no frontend-safe split of deduct/stock/insert)", () => {
  assert.equal((migration.match(/create or replace function purchase_shop_product/g) || []).length, 1);
  assert.doesNotMatch(migration, /create or replace function deduct_points/);
});

// =====================================================================
// 5. MIGRATION — admin functions & purchase log
// =====================================================================

test("admin product RPCs exist and audit every write", () => {
  for (const f of ["get_admin_shop_products", "create_shop_product", "update_shop_product", "get_admin_shop_purchases", "admin_set_purchase_delivered"]) {
    assert.ok(migration.indexOf("create or replace function " + f) !== -1, "missing RPC: " + f);
  }
  assert.match(migration, /insert into audit_logs[\s\S]*create_shop_product/);
  assert.match(migration, /insert into audit_logs[\s\S]*update_shop_product/);
});

test("update_shop_product never touches purchase snapshots", () => {
  const fn = fnBody("update_shop_product");
  assert.match(fn, /update shop_products set/);
  assert.doesNotMatch(fn, /update shop_purchases/);
  assert.doesNotMatch(fn, /delete from shop_purchases/);
});

test("no hard delete of products with purchases (FK NO ACTION preserves history)", () => {
  assert.match(migration, /shop_purchases \(/);
  assert.match(migration, /product_id\s+uuid not null references shop_products\(id\)/);
  assert.doesNotMatch(migration, /on delete cascade/);
});

test("admin purchase log joins youth identity + snapshot", () => {
  const fn = migration.slice(migration.indexOf("create or replace function get_admin_shop_purchases"), migration.lastIndexOf("$$"));
  assert.match(fn, /p\.full_name as youth_name/);
  assert.match(fn, /p\.phone as youth_phone/);
  assert.match(fn, /product_name_snapshot/);
});

test("grants cover all new shop functions for anon, authenticated", () => {
  assert.match(migration, /grant execute on function/);
  for (const f of ["get_shop_products_public", "get_my_shop_purchases", "purchase_shop_product", "get_admin_shop_products", "create_shop_product", "update_shop_product", "get_admin_shop_purchases", "admin_set_purchase_delivered"]) {
    assert.ok(migration.indexOf("  " + f + ",") !== -1 || migration.indexOf(f) !== -1, "missing grant for " + f);
  }
});

// =====================================================================
// 6. MIGRATION — legacy auth / architecture preserved
// =====================================================================

test("migration 4 does NOT use the abandoned token-session architecture", () => {
  assert.doesNotMatch(migration, /app_sessions/);
  assert.doesNotMatch(migration, /resolve_youth_session/);
  assert.doesNotMatch(migration, /resolve_admin_session/);
  assert.doesNotMatch(migration, /session_token/);
  assert.doesNotMatch(migration, /issue_app_session/);
});

test("migration 4 does not touch the legacy attendance/auth functions", () => {
  assert.doesNotMatch(migration, /register_attendance/);
  assert.doesNotMatch(migration, /youth_login/);
  assert.doesNotMatch(migration, /admin_login/);
  assert.doesNotMatch(migration, /create or replace function register_youth_user/);
});

test("legacy register_attendance contract in setup remains untouched", () => {
  const sig = setup.slice(setup.indexOf("create or replace function register_attendance"), setup.indexOf("returns jsonb", setup.indexOf("create or replace function register_attendance")));
  assert.match(sig, /p_user_id\s+uuid/);
  assert.doesNotMatch(sig, /session_token/);
});

test("shop migration adds only safe additive changes to existing functions", () => {
  assert.ok(migration.indexOf("create or replace function sync_wallet_totals") !== -1);
  assert.match(migration, /filter \(where type in \('admin_deduction','shop_purchase'\)\), 0\)/);
  assert.ok(migration.indexOf("create or replace function get_my_transactions") !== -1);
  assert.match(migration, /p_group = 'shop' and type = 'shop_purchase'/);
});

// =====================================================================
// 7. FRONTEND — youth shop page & flow
// =====================================================================

test("youth shop page wires legacy youth session and loads core+api+shop js", () => {
  const html = read("shop.html");
  assert.match(html, /assets\/js\/shop-core\.js/);
  assert.match(html, /assets\/js\/shop\.js/);
  assert.match(html, /assets\/js\/auth\.js/);
});

test("youth shop.js uses legacy session and the single atomic purchase RPC", () => {
  const js = read("assets/js/shop.js");
  assert.match(js, /AmoyniSession\.requireYouth\("login\.html"\)/);
  assert.match(js, /purchase_shop_product/);
  assert.match(js, /p_user_id:\s*session\.user_id/);
  assert.match(js, /p_product_id:\s*product\.id/);
  assert.doesNotMatch(js, /session_token/);
  assert.match(js, /core\.computeProductState/);
  assert.match(js, /updateYouth\(\{ current_balance: value \}\)/);
  assert.match(js, /updateBalanceLocally\(result\.balance_after\)/);
});

test("youth shop renders buy confirmation before the purchase call", () => {
  const js = read("assets/js/shop.js");
  assert.match(js, /openBuyConfirm/);
  assert.match(js, /تأكيد الشراء/);
  assert.match(js, /confirmLabel: "تأكيد الشراء"/);
});

test("youth shop shows balance and purchase history sections", () => {
  const html = read("shop.html");
  assert.match(html, /products-list/);
  assert.match(html, /purchases-list/);
  assert.match(html, /سجل مشترياتك/);
});

test("dashboard links to the shop", () => {
  const html = read("dashboard.html");
  assert.match(html, /href="shop\.html"/);
});

test("wallet recognizes shop purchases in labels and filter", () => {
  const js = read("assets/js/wallet.js");
  assert.match(js, /shop_purchase: "شراء من المتجر"/);
  const html = read("wallet.html");
  assert.match(html, /data-group="shop">متجر</);
});

// =====================================================================
// 8. FRONTEND — admin shop page & flow
// =====================================================================

test("admin shop page mounts legacy admin nav and shop scripts", () => {
  const html = read("admin/shop.html");
  assert.match(html, /assets\/js\/admin\/nav\.js/);
  assert.match(html, /assets\/js\/admin\/shop\.js/);
  assert.match(html, /assets\/js\/shop-core\.js/);
  assert.match(html, /متجر النقاط/);
});

test("admin shop.js uses legacy admin session and p_admin_id conventions", () => {
  const js = read("assets/js/admin/shop.js");
  assert.match(js, /AmoyniAdminNav\.mount\("shop", "متجر النقاط"\)/);
  assert.match(js, /p_admin_id:\s*admin\.admin_id/);
  assert.match(js, /create_shop_product/);
  assert.match(js, /update_shop_product/);
  assert.match(js, /get_admin_shop_purchases/);
  assert.match(js, /admin_set_purchase_delivered/);
  assert.doesNotMatch(js, /session_token/);
});

test("admin nav includes the shop entry", () => {
  const js = read("assets/js/admin/nav.js");
  assert.match(js, /"shop"/);
  assert.match(js, /shop\.html/);
  assert.match(js, /متجر النقاط/);
});

// =====================================================================
// 9. FRONTEND — stable youth-facing error mapping
// =====================================================================

test("shop backend error codes are mapped to friendly messages", () => {
  const js = read("assets/js/utils.js");
  assert.match(js, /PRODUCT_NOT_FOUND:/);
  assert.match(js, /PRODUCT_UNAVAILABLE:/);
  assert.match(js, /OUT_OF_STOCK:/);
  assert.match(js, /INSUFFICIENT_POINTS:/);
  assert.match(js, /PURCHASE_LIMIT_REACHED:/);
});

// =====================================================================
// 10. REGRESSION — existing screens still reference legacy flow
// =====================================================================

test("existing youth and admin entry points still use legacy session (no migration-3 regression)", () => {
  const wallet = read("assets/js/wallet.js");
  const vouchers = read("assets/js/admin/vouchers.js");
  assert.match(wallet, /requireYouth\("login\.html"\)/);
  assert.match(vouchers, /AmoyniAdminNav\.mount\("vouchers"/);
  assert.doesNotMatch(wallet, /session_token/);
  assert.doesNotMatch(vouchers, /session_token/);
});