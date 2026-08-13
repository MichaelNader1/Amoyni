"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validateDrafts, saveRules } = require("../assets/js/meeting-point-rules.js");

const root = path.resolve(__dirname, "..");
const createHtml = fs.readFileSync(path.join(root, "admin/meeting-create.html"), "utf8");
const createJs = fs.readFileSync(path.join(root, "assets/js/admin/meeting-create.js"), "utf8");
const detailsHtml = fs.readFileSync(path.join(root, "admin/meeting-details.html"), "utf8");
const detailsJs = fs.readFileSync(path.join(root, "assets/js/admin/meeting-details.js"), "utf8");
const adminCss = fs.readFileSync(path.join(root, "assets/css/admin.css"), "utf8");

function rule(start, end, points) {
  return { start, end, points };
}

const A = rule("2026-08-13T19:00", "2026-08-13T19:10", "10");
const B = rule("2026-08-13T19:10", "2026-08-13T19:20", "5");

test("meeting with zero point rules is valid and saves no RPCs", async () => {
  const result = validateDrafts([]);
  assert.equal(result.valid, true);
  let calls = 0;
  assert.equal(await saveRules(async () => { calls++; }, "admin", "meeting", result.rules, (value) => value), 0);
  assert.equal(calls, 0);
});

test("meeting with one point rule is valid", () => {
  const result = validateDrafts([A]);
  assert.equal(result.valid, true);
  assert.equal(result.rules.length, 1);
  assert.equal(result.rules[0].points, 10);
});

test("multiple adjacent point rules are valid", () => {
  assert.equal(validateDrafts([A, B]).valid, true);
});

test("overlapping rules identify both conflicting rows", () => {
  const result = validateDrafts([A, rule("2026-08-13T19:05", "2026-08-13T19:15", 3)]);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.find((error) => error.code === "OVERLAPPING_RANGE").rows, [0, 1]);
});

test("duplicate ranges are rejected", () => {
  assert.ok(validateDrafts([A, A]).errors.some((error) => error.code === "DUPLICATE_RANGE"));
});

test("end equal to or before start is rejected", () => {
  assert.ok(validateDrafts([rule("2026-08-13T19:10", "2026-08-13T19:10", 5)]).errors.some((error) => error.code === "INVALID_RANGE"));
  assert.ok(validateDrafts([rule("2026-08-13T19:10", "2026-08-13T19:00", 5)]).errors.some((error) => error.code === "INVALID_RANGE"));
});

test("negative points are rejected and zero points are allowed", () => {
  assert.ok(validateDrafts([rule(A.start, A.end, -1)]).errors.some((error) => error.code === "INVALID_POINTS"));
  assert.equal(validateDrafts([rule(A.start, A.end, 0)]).valid, true);
});

test("rules are sent sequentially with the created meeting id", async () => {
  const calls = [];
  await saveRules(async (name, payload) => { calls.push({ name, payload }); }, "admin-1", "created-meeting", [A, B], (value) => value + "Z");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.name), ["add_point_rule", "add_point_rule"]);
  assert.deepEqual(calls.map((call) => call.payload.p_meeting_id), ["created-meeting", "created-meeting"]);
  assert.deepEqual(calls.map((call) => call.payload.p_sort_order), [0, 1]);
});

test("partial rule failure reports the failed row and saved count", async () => {
  let calls = 0;
  await assert.rejects(
    saveRules(async () => { calls++; if (calls === 2) throw new Error("database rejected rule"); }, "admin", "meeting", [A, B], (value) => value),
    (error) => error.message === "POINT_RULE_SAVE_FAILED" && error.failedIndex === 1 && error.savedCount === 1
  );
});

test("create page waits for meeting id, handles partial failure, and uses shared responsive structure", () => {
  const createCall = createJs.indexOf('call("create_meeting"');
  const saveRulesCall = createJs.indexOf(".saveRules(");
  assert.ok(createCall >= 0 && createCall < saveRulesCall);
  assert.match(createJs, /createdMeetingId = result\.meeting_id/);
  assert.match(createJs, /rules_save_error=1/);
  assert.match(createHtml, /id="create-rules-list"/);
  assert.match(createHtml, /meeting-point-rules\.js/);
  assert.match(detailsHtml, /point-rule-editor-row point-rule-add-row/);
  assert.match(adminCss, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(adminCss, /@media \(max-width: 639px\)[\s\S]*\.point-rule-editor-row[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.doesNotMatch(adminCss, /\.point-rule-editor-row[^}]*min-width:\s*[1-9]\d{2,}px/);
});

test("meeting details keeps rule editing draft-only", () => {
  assert.match(detailsJs, /m\.status === "draft"/);
  assert.match(detailsJs, /currentMeeting && currentMeeting\.status === "draft"/);
  assert.match(detailsJs, /add-rule-form[^\n]*m\.status === "draft"/);
  assert.match(detailsJs, /rules-locked-note[^\n]*m\.status === "draft"/);
});
