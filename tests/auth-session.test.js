"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const authSource = fs.readFileSync(path.resolve(__dirname, "../assets/js/auth.js"), "utf8");

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function loadAuth() {
  const redirects = [];
  const context = {
    localStorage: storage(),
    sessionStorage: storage(),
    window: { location: { replace: (target) => redirects.push(target) } },
  };
  vm.runInNewContext(authSource, context);
  return { session: context.window.AmoyniSession, context, redirects };
}

test("admin legacy session is stored, survives a route guard, and redirects from login", () => {
  const { session, context, redirects } = loadAuth();
  const admin = { success: true, admin_id: "admin-id", username: "admin", display_name: "Admin" };
  session.setAdmin(admin, true);
  assert.deepEqual(JSON.parse(context.localStorage.getItem("amoyni_admin_session")), admin);
  assert.equal(session.requireAdmin("login.html").admin_id, "admin-id");
  assert.equal(redirects.length, 0);
  session.redirectIfAdminLoggedIn("index.html");
  assert.deepEqual(redirects, ["index.html"]);
});

test("youth legacy session is accepted without a server token", () => {
  const { session, context, redirects } = loadAuth();
  const youth = { success: true, user_id: "user-id", full_name: "Youth" };
  session.setYouth(youth, false);
  assert.deepEqual(JSON.parse(context.sessionStorage.getItem("amoyni_youth_session")), youth);
  assert.equal(session.requireYouth("login.html").user_id, "user-id");
  assert.equal(redirects.length, 0);
});

test("legacy logout is local and does not call a token RPC", () => {
  const { session, context, redirects } = loadAuth();
  session.setAdmin({ admin_id: "admin-id" }, true);
  session.adminLogout("login.html");
  assert.equal(context.localStorage.getItem("amoyni_admin_session"), null);
  assert.deepEqual(redirects, ["login.html"]);
});
