"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const scanner = fs.readFileSync(path.join(root, "assets/js/scanner.js"), "utf8");
const setup = fs.readFileSync(path.join(root, "supabase/amoyni_supabase_setup.sql"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migration_3_secure_qr_attendance.sql"), "utf8");
const scannerHtml = fs.readFileSync(path.join(root, "scanner.html"), "utf8");
const meetingCreateHtml = fs.readFileSync(path.join(root, "admin/meeting-create.html"), "utf8");

function attendanceBody(sql) {
  const plainStart = sql.indexOf("create or replace function register_attendance");
  const qualifiedStart = sql.indexOf("create or replace function public.register_attendance");
  const start = plainStart >= 0 ? plainStart : qualifiedStart;
  const end = sql.indexOf("-- ---------------------------------------------------------------", start + 50);
  return sql.slice(start, end);
}

test("frontend attendance request sends no caller identity or client time", () => {
  const call = scanner.slice(scanner.indexOf('call("register_attendance"'), scanner.indexOf("});", scanner.indexOf('call("register_attendance"')) + 3);
  assert.match(call, /p_session_token/);
  assert.doesNotMatch(call, /p_user_id|p_scan_started_at/);
});

test("scanner pauses before attendance RPC and stops on navigation", () => {
  const stop = scanner.indexOf("await stopCamera()");
  const rpc = scanner.indexOf('call("register_attendance"');
  assert.ok(stop > 0 && stop < rpc);
  assert.match(scanner, /addEventListener\("pagehide", cleanup/);
});

test("browser pages load testable helpers before their consumers", () => {
  assert.ok(scannerHtml.indexOf("qr-attendance-core.js") < scannerHtml.indexOf("assets/js/scanner.js"));
  assert.ok(meetingCreateHtml.indexOf("datetime.js") < meetingCreateHtml.indexOf("admin/meeting-create.js"));
});

for (const [name, sql] of [["setup", setup], ["migration", migration]]) {
  test(name + " derives attendance identity from a session token", () => {
    const body = attendanceBody(sql);
    assert.match(body, /p_session_token text/);
    assert.match(body, /resolve_youth_session\(p_session_token\)/);
    assert.doesNotMatch(body.slice(0, body.indexOf("returns jsonb")), /p_user_id|p_scan_started_at/);
  });

  test(name + " uses one server timestamp for windows, points and persistence", () => {
    const body = attendanceBody(sql);
    assert.match(body, /v_server_time\s+timestamptz\s*:=\s*now\(\)/);
    assert.match(body, /v_server_time < v_meeting\.attendance_start/);
    assert.match(body, /v_server_time > v_meeting\.attendance_end/);
    assert.match(body, /v_server_time >= start_time/);
    assert.doesNotMatch(body, /SCAN_TIMEOUT|abs\s*\(/);
  });

  test(name + " preserves atomic attendance writes and raffle distinctions", () => {
    const body = attendanceBody(sql);
    assert.match(body, /insert into attendance_records/);
    assert.match(body, /update profiles/);
    assert.match(body, /insert into point_transactions/);
    assert.match(body, /recalculate_user_streak/);
    assert.match(body, /raffle_enabled/);
    assert.match(body, /raffle_exhausted/);
  });

  test(name + " protects QR tokens and serializes the active-meeting invariant", () => {
    assert.match(sql, /drop policy if exists meetings_public_read/);
    assert.match(sql, /revoke select on (table )?(public\.)?meetings from anon/);
    assert.match(sql, /pg_advisory_xact_lock/);
    assert.match(sql, /trg_single_active_meeting/);
    assert.match(sql, /ACTIVE_MEETING_EXISTS/);
  });

  test(name + " hardens security-definer attendance and session helpers", () => {
    assert.match(attendanceBody(sql), /security definer\s+(set search_path|\nset search_path)/);
    assert.match(sql, /revoke all on function (public\.)?resolve_youth_session\(text\)/);
    assert.match(sql, /digest\(p_session_token, 'sha256'\)/);
  });
}

test("database unique constraint remains authoritative for duplicate attendance", () => {
  assert.match(setup, /unique \(meeting_id, user_id\)/);
});

test("migration is transactional and does not delete business records", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.doesNotMatch(migration, /delete\s+from\s+(profiles|meetings|attendance_records|point_transactions)/i);
  assert.match(migration, /ACTIVE_MEETING_CLEANUP_REQUIRED/);
});

test("server sessions are revocable on logout", () => {
  assert.match(setup, /function logout_app_session/);
  assert.match(setup, /set revoked_at = now\(\)/);
  assert.match(migration, /set revoked_at=now\(\)/);
});
