"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const qr = require("../assets/js/qr-attendance-core.js");

const scannerSource = fs.readFileSync(path.resolve(__dirname, "../assets/js/scanner.js"), "utf8");
const VALID = JSON.stringify({
  meeting_id: "123e4567-e89b-42d3-a456-426614174000",
  qr_token: "0123456789abcdef0123456789abcdef",
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

async function createHarness(apiCall) {
  let clock = Date.parse("2026-08-13T09:00:00.000Z");
  let retryHandler = null;
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        style: {},
        className: "",
        innerHTML: "",
        textContent: "",
        addEventListener(type, handler) {
          if (id === "retry-camera-btn" && type === "click") retryHandler = handler;
        },
        insertAdjacentHTML() {},
      });
    }
    return elements.get(id);
  }

  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }

  class FakeScanner {
    constructor() {
      this.isScanning = false;
      this.stopCalls = 0;
      FakeScanner.instance = this;
    }
    static async getCameras() { return [{ id: "camera" }]; }
    async start(config, options, onSuccess) {
      this.isScanning = true;
      this.onSuccess = onSuccess;
    }
    async stop() {
      this.stopCalls++;
      this.isScanning = false;
    }
  }

  const context = {
    Date: FakeDate,
    Html5Qrcode: FakeScanner,
    Html5QrcodeSupportedFormats: { QR_CODE: 0 },
    document: { getElementById: element },
    setTimeout: () => 0,
    window: {
      AmoyniSession: {
        requireYouth: () => ({ user_id: "legacy-user" }),
        updateYouth() {},
      },
      AmoyniQR: qr,
      AmoyniAPI: { call: apiCall },
      AmoyniUI: {
        escapeHtml: (value) => value,
        friendlyError: (error) => error.message,
        formatNumber: (value) => String(value),
      },
      AmoyniFX: { fireCelebration() {} },
      addEventListener() {},
    },
  };
  vm.runInNewContext(scannerSource, context);
  await flush();
  return {
    scanner: FakeScanner.instance,
    advance(ms) { clock += ms; },
    retry: async () => { assert.ok(retryHandler); await retryHandler(); await flush(); },
  };
}

function successResult() {
  return { points_awarded: 10, balance_after: 20, streak: 1, raffle_number: 7 };
}

test("camera open for over 60 seconds still sends a fresh detection timestamp", async () => {
  const calls = [];
  const harness = await createHarness(async (name, payload) => { calls.push({ name, payload }); return successResult(); });
  harness.advance(61_000);
  await harness.scanner.onSuccess(VALID);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "register_attendance");
  assert.equal(calls[0].payload.p_scan_started_at, "2026-08-13T09:01:01.000Z");
  assert.equal(calls[0].payload.p_user_id, "legacy-user");
});

test("retry restarts scanning and generates a new timestamp", async () => {
  const timestamps = [];
  let attempt = 0;
  const harness = await createHarness(async (name, payload) => {
    timestamps.push(payload.p_scan_started_at);
    attempt++;
    if (attempt === 1) throw new Error("temporary failure");
    return successResult();
  });
  await harness.scanner.onSuccess(VALID);
  harness.advance(5_000);
  await harness.retry();
  await harness.scanner.onSuccess(VALID);
  assert.deepEqual(timestamps, ["2026-08-13T09:00:00.000Z", "2026-08-13T09:00:05.000Z"]);
});

test("one detection produces one request and success prevents further scans", async () => {
  let resolveRequest;
  const pending = new Promise((resolve) => { resolveRequest = resolve; });
  let calls = 0;
  const harness = await createHarness(async () => { calls++; return pending; });
  const first = harness.scanner.onSuccess(VALID);
  await harness.scanner.onSuccess(VALID);
  await flush();
  assert.equal(calls, 1);
  resolveRequest(successResult());
  await first;
  await harness.scanner.onSuccess(VALID);
  assert.equal(calls, 1);
  assert.equal(harness.scanner.stopCalls, 1);
});
