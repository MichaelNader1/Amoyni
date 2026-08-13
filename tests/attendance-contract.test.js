"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const scanner = read("assets/js/scanner.js");
const setup = read("supabase/amoyni_supabase_setup.sql");
const meetingCreate = read("assets/js/admin/meeting-create.js");
const meetingDetails = read("assets/js/admin/meeting-details.js");

test("legacy register_attendance request shape is unchanged", () => {
  const start = scanner.indexOf('call("register_attendance"');
  const call = scanner.slice(start, scanner.indexOf("});", start) + 3);
  assert.match(call, /p_user_id:\s*session\.user_id/);
  assert.match(call, /p_meeting_id:\s*parsed\.value\.meeting_id/);
  assert.match(call, /p_qr_token:\s*parsed\.value\.qr_token/);
  assert.match(call, /p_scan_started_at:\s*scanStartedAt/);
  assert.doesNotMatch(call, /session_token/);
});

test("scan timestamp is created when a detection is accepted", () => {
  const handler = scanner.slice(scanner.indexOf("async function handleDecodedText"), scanner.indexOf("function renderSuccess"));
  const accepted = handler.indexOf("beginDetection");
  const timestamp = handler.indexOf("new Date().toISOString()");
  const stop = handler.indexOf("await stopCamera()");
  const rpc = handler.indexOf('call("register_attendance"');
  assert.ok(accepted >= 0 && accepted < timestamp);
  assert.ok(timestamp < stop && stop < rpc);
  const cameraStart = scanner.slice(scanner.indexOf("async function startCameraScan"));
  assert.doesNotMatch(cameraStart, /const scanStartedAt/);
});

test("scanner stops duplicate processing and exposes controlled retry", () => {
  assert.match(scanner, /if \(!lifecycle\.beginDetection/);
  assert.match(scanner, /await stopCamera\(\)/);
  assert.match(scanner, /lifecycle\.markError\(\)/);
  assert.match(scanner, /resetAndStart/);
  assert.match(scanner, /lifecycle\.markSuccess\(\)/);
});

test("legacy SQL attendance contract and timeout remain intact", () => {
  const signature = setup.slice(setup.indexOf("create or replace function register_attendance"), setup.indexOf("returns jsonb", setup.indexOf("create or replace function register_attendance")));
  assert.match(signature, /p_user_id\s+uuid/);
  assert.match(signature, /p_meeting_id\s+uuid/);
  assert.match(signature, /p_qr_token\s+varchar/);
  assert.match(signature, /p_scan_started_at\s+timestamptz/);
  assert.doesNotMatch(signature, /session_token/);
  assert.match(setup, /SCAN_TIMEOUT/);
});

test("meeting management uses legacy RPC arguments", () => {
  assert.match(meetingCreate, /p_admin_id:\s*admin\.admin_id/);
  assert.doesNotMatch(meetingCreate, /session_token/);
  assert.match(meetingDetails, /get_meeting_details", \{ p_meeting_id: meetingId \}/);
  assert.match(meetingDetails, /start_meeting", \{ p_admin_id: admin\.admin_id/);
  assert.match(meetingDetails, /close_meeting", \{ p_admin_id: admin\.admin_id/);
  assert.doesNotMatch(meetingDetails, /session_token/);
});

test("attendance business-rule writes remain present", () => {
  assert.match(setup, /unique \(meeting_id, user_id\)/);
  assert.match(setup, /insert into attendance_records/);
  assert.match(setup, /insert into point_transactions/);
  assert.match(setup, /recalculate_user_streak/);
  assert.match(setup, /v_raffle_number/);
  assert.match(setup, /activate_referral_reward/);
});
