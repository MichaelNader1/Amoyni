"use strict";

process.env.TZ = "Africa/Cairo";
const test = require("node:test");
const assert = require("node:assert/strict");
const dates = require("../assets/js/datetime.js");

test("formats Cairo daytime as local wall time", () => {
  const value = new Date(2026, 7, 13, 21, 0, 0);
  assert.equal(dates.toLocalDateValue(value), "2026-08-13");
  assert.equal(dates.toLocalDateTimeValue(value), "2026-08-13T21:00");
});

test("formats near-midnight value without UTC date shift", () => {
  const value = new Date(2026, 7, 14, 0, 5, 0);
  assert.equal(dates.toLocalDateValue(value), "2026-08-14");
  assert.equal(dates.toLocalDateTimeValue(value), "2026-08-14T00:05");
});

test("local datetime converts to UTC exactly once", () => {
  assert.equal(dates.localDateTimeToIso("2026-08-13T21:00"), "2026-08-13T18:00:00.000Z");
  assert.equal(dates.localDateTimeToIso("2026-08-14T00:05"), "2026-08-13T21:05:00.000Z");
});

test("rejects malformed datetime-local input", () => {
  assert.equal(dates.localDateTimeToIso("2026-08-13 21:00"), null);
  assert.equal(dates.localDateTimeToIso(""), null);
});
