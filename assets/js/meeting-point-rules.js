(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AmoyniMeetingPointRules = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function validateDrafts(drafts) {
    const rules = (drafts || []).map(function (draft) {
      return {
        start: typeof draft.start === "string" ? draft.start.trim() : "",
        end: typeof draft.end === "string" ? draft.end.trim() : "",
        pointsRaw: draft.points,
      };
    });
    const errors = [];

    rules.forEach(function (rule, index) {
      const row = index + 1;
      const pointsText = rule.pointsRaw === null || rule.pointsRaw === undefined ? "" : String(rule.pointsRaw).trim();
      const points = Number(pointsText);
      const startMs = rule.start ? new Date(rule.start).getTime() : NaN;
      const endMs = rule.end ? new Date(rule.end).getTime() : NaN;

      if (!rule.start) errors.push({ code: "START_REQUIRED", rows: [index], message: "وقت البداية مطلوب في الشريحة رقم " + row + "." });
      if (!rule.end) errors.push({ code: "END_REQUIRED", rows: [index], message: "وقت النهاية مطلوب في الشريحة رقم " + row + "." });
      if (!pointsText) errors.push({ code: "POINTS_REQUIRED", rows: [index], message: "عدد النقاط مطلوب في الشريحة رقم " + row + "." });
      else if (!Number.isInteger(points) || points < 0) errors.push({ code: "INVALID_POINTS", rows: [index], message: "نقاط الشريحة رقم " + row + " يجب أن تكون عددًا صحيحًا صفر أو أكبر." });
      if (rule.start && rule.end && (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs)) {
        errors.push({ code: "INVALID_RANGE", rows: [index], message: "نهاية الشريحة رقم " + row + " يجب أن تكون بعد بدايتها." });
      }

      rule.points = points;
      rule.startMs = startMs;
      rule.endMs = endMs;
      delete rule.pointsRaw;
    });

    for (let left = 0; left < rules.length; left++) {
      if (!Number.isFinite(rules[left].startMs) || !Number.isFinite(rules[left].endMs) || rules[left].endMs <= rules[left].startMs) continue;
      for (let right = left + 1; right < rules.length; right++) {
        if (!Number.isFinite(rules[right].startMs) || !Number.isFinite(rules[right].endMs) || rules[right].endMs <= rules[right].startMs) continue;
        const duplicate = rules[left].startMs === rules[right].startMs && rules[left].endMs === rules[right].endMs;
        const overlaps = rules[left].startMs < rules[right].endMs && rules[right].startMs < rules[left].endMs;
        if (duplicate || overlaps) {
          errors.push({
            code: duplicate ? "DUPLICATE_RANGE" : "OVERLAPPING_RANGE",
            rows: [left, right],
            message: "الشريحتان رقم " + (left + 1) + " و" + (right + 1) + (duplicate ? " لهما نفس الفترة." : " متداخلتان."),
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      rules: rules.map(function (rule) { return { start: rule.start, end: rule.end, points: rule.points }; }),
    };
  }

  async function saveRules(callRpc, adminId, meetingId, rules, toIso) {
    let savedCount = 0;
    for (let index = 0; index < rules.length; index++) {
      const rule = rules[index];
      try {
        await callRpc("add_point_rule", {
          p_admin_id: adminId,
          p_meeting_id: meetingId,
          p_start_time: toIso(rule.start),
          p_end_time: toIso(rule.end),
          p_points: rule.points,
          p_sort_order: index,
        });
        savedCount++;
      } catch (cause) {
        const error = new Error("POINT_RULE_SAVE_FAILED");
        error.cause = cause;
        error.failedIndex = index;
        error.savedCount = savedCount;
        throw error;
      }
    }
    return savedCount;
  }

  return { validateDrafts: validateDrafts, saveRules: saveRules };
});
