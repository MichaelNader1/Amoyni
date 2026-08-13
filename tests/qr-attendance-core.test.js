"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePayload, createScannerState } = require("../assets/js/qr-attendance-core.js");

const VALID = JSON.stringify({
  meeting_id: "123e4567-e89b-42d3-a456-426614174000",
  qr_token: "0123456789abcdef0123456789abcdef",
});

test("valid QR payload is normalized", () => {
  const result = parsePayload(VALID);
  assert.equal(result.ok, true);
  assert.equal(result.value.meeting_id, "123e4567-e89b-42d3-a456-426614174000");
});

for (const [name, input, code] of [
  ["invalid JSON", "not json", "INVALID_JSON"],
  ["array", "[]", "INVALID_OBJECT"],
  ["null", "null", "INVALID_OBJECT"],
  ["missing meeting id", JSON.stringify({ qr_token: "0".repeat(32) }), "INVALID_MEETING_ID"],
  ["invalid UUID", JSON.stringify({ meeting_id: "123", qr_token: "0".repeat(32) }), "INVALID_MEETING_ID"],
  ["missing token", JSON.stringify({ meeting_id: "123e4567-e89b-42d3-a456-426614174000" }), "INVALID_TOKEN_FORMAT"],
  ["short token", JSON.stringify({ meeting_id: "123e4567-e89b-42d3-a456-426614174000", qr_token: "abcd" }), "INVALID_TOKEN_FORMAT"],
  ["non-hex token", JSON.stringify({ meeting_id: "123e4567-e89b-42d3-a456-426614174000", qr_token: "z".repeat(32) }), "INVALID_TOKEN_FORMAT"],
]) {
  test("rejects " + name, () => {
    assert.deepEqual(parsePayload(input), { ok: false, error: code });
  });
}

test("scanner follows idle-starting-scanning-processing-success", () => {
  const state = createScannerState();
  assert.equal(state.beginStarting(), true);
  assert.equal(state.markScanning(), true);
  assert.equal(state.beginDetection(VALID, 1000), true);
  state.markSuccess();
  assert.equal(state.getState(), "success");
  assert.equal(state.beginDetection(VALID, 5000), false);
});

test("only one request can enter processing", () => {
  const state = createScannerState();
  state.beginStarting();
  state.markScanning();
  assert.equal(state.beginDetection(VALID, 1000), true);
  assert.equal(state.beginDetection(VALID, 1001), false);
});

test("controlled retry clears prior QR and accepts a fresh attempt", () => {
  const state = createScannerState();
  state.beginStarting();
  state.markScanning();
  state.beginDetection(VALID, 1000);
  state.markError();
  assert.equal(state.beginStarting(), false);
  state.reset();
  assert.equal(state.beginStarting(), true);
  state.markScanning();
  assert.equal(state.beginDetection(VALID, 1001), true);
});

test("camera age does not exist in scanner state", () => {
  const state = createScannerState();
  state.beginStarting();
  state.markScanning();
  assert.equal(state.beginDetection(VALID, 10 * 60 * 1000), true);
});

test("cleanup leaves scanner idle", () => {
  const state = createScannerState();
  state.beginStarting();
  state.markScanning();
  state.cleanup();
  assert.equal(state.getState(), "idle");
});
