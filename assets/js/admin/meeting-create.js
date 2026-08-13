(function () {
  const admin = window.AmoyniAdminNav.mount("meetings", "إنشاء اجتماع");
  if (!admin) return;

  const form = document.getElementById("create-meeting-form");
  const submitBtn = document.getElementById("create-submit");
  const raffleCheckbox = document.getElementById("raffle_enabled");
  const raffleFields = document.getElementById("raffle-range-fields");
  const rulesList = document.getElementById("create-rules-list");
  const rulesEmpty = document.getElementById("create-rules-empty");
  const rulesError = document.getElementById("create-rules-error");
  const addRuleBtn = document.getElementById("add-create-rule-btn");

  function updateRulesEmptyState() {
    rulesEmpty.style.display = rulesList.children.length ? "none" : "block";
  }

  function renumberRules() {
    Array.from(rulesList.querySelectorAll(".point-rule-editor-row")).forEach(function (row, index) {
      row.dataset.ruleIndex = index;
      const remove = row.querySelector("[data-remove-create-rule]");
      remove.setAttribute("aria-label", "حذف شريحة النقاط رقم " + (index + 1));
      remove.title = "حذف الشريحة رقم " + (index + 1);
    });
  }

  function addRuleDraft() {
    const row = document.createElement("div");
    row.className = "point-rule-editor-row";
    row.innerHTML =
      '<div class="field"><label class="field-label">من</label><input type="datetime-local" class="field-input" data-rule-start></div>' +
      '<div class="field"><label class="field-label">إلى</label><input type="datetime-local" class="field-input" data-rule-end></div>' +
      '<div class="field"><label class="field-label">النقاط</label><input type="number" min="0" step="1" value="10" class="field-input" data-rule-points></div>' +
      '<button type="button" class="btn btn-danger btn-sm" data-remove-create-rule>حذف</button>';
    rulesList.appendChild(row);
    renumberRules();
    updateRulesEmptyState();
    row.querySelector("[data-rule-start]").focus();
  }

  function collectRuleDrafts() {
    return Array.from(rulesList.querySelectorAll(".point-rule-editor-row")).map(function (row) {
      return {
        start: row.querySelector("[data-rule-start]").value,
        end: row.querySelector("[data-rule-end]").value,
        points: row.querySelector("[data-rule-points]").value,
      };
    });
  }

  function clearRuleErrors() {
    rulesError.classList.remove("is-visible");
    rulesError.textContent = "";
    rulesList.querySelectorAll(".point-rule-editor-row").forEach(function (row) { row.classList.remove("has-error"); });
  }

  function showRuleErrors(errors) {
    clearRuleErrors();
    const affectedRows = new Set();
    errors.forEach(function (error) { error.rows.forEach(function (index) { affectedRows.add(index); }); });
    affectedRows.forEach(function (index) {
      const row = rulesList.querySelector('[data-rule-index="' + index + '"]');
      if (row) row.classList.add("has-error");
    });
    rulesError.textContent = errors.map(function (error) { return error.message; }).join(" ");
    rulesError.classList.add("is-visible");
    rulesError.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  addRuleBtn.addEventListener("click", addRuleDraft);
  rulesList.addEventListener("click", function (event) {
    const remove = event.target.closest("[data-remove-create-rule]");
    if (!remove) return;
    remove.closest(".point-rule-editor-row").remove();
    clearRuleErrors();
    renumberRules();
    updateRulesEmptyState();
  });

  raffleCheckbox.addEventListener("change", function () {
    raffleFields.style.display = raffleCheckbox.checked ? "grid" : "none";
  });

  // Sensible defaults: today, next couple of hours
  const now = new Date();
  document.getElementById("meeting_date").value = window.AmoyniDateTime.toLocalDateValue(now);
  document.getElementById("attendance_start").value = window.AmoyniDateTime.toLocalDateTimeValue(now);
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  document.getElementById("attendance_end").value = window.AmoyniDateTime.toLocalDateTimeValue(end);

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    window.AmoyniValidate.clearAllErrors(form);
    clearRuleErrors();

    const title = document.getElementById("title").value.trim();
    const meetingDate = document.getElementById("meeting_date").value;
    const start = document.getElementById("attendance_start").value;
    const end = document.getElementById("attendance_end").value;
    let hasError = false;

    if (!window.AmoyniValidate.isRequired(title)) {
      window.AmoyniValidate.setFieldError(document.getElementById("field-title"), "اسم الاجتماع مطلوب");
      hasError = true;
    }
    if (!meetingDate) {
      window.AmoyniValidate.setFieldError(document.getElementById("field-meeting_date"), "التاريخ مطلوب");
      hasError = true;
    }
    if (!start || !end || new Date(end) <= new Date(start)) {
      window.AmoyniValidate.setFieldError(document.getElementById("field-attendance_end"), "وقت النهاية يجب أن يكون بعد البداية");
      hasError = true;
    }
    const ruleValidation = window.AmoyniMeetingPointRules.validateDrafts(collectRuleDrafts());
    if (!ruleValidation.valid) {
      showRuleErrors(ruleValidation.errors);
      hasError = true;
    }
    if (hasError) return;

    window.AmoyniUI.setButtonLoading(submitBtn, true);
    let createdMeetingId = null;
    try {
      const result = await window.AmoyniAPI.call("create_meeting", {
        p_admin_id: admin.admin_id,
        p_title: title,
        p_meeting_date: meetingDate,
        p_attendance_start: window.AmoyniDateTime.localDateTimeToIso(start),
        p_attendance_end: window.AmoyniDateTime.localDateTimeToIso(end),
        p_content_type: document.getElementById("content_type").value,
        p_verse_text: document.getElementById("verse_text").value.trim() || null,
        p_announcement_text: document.getElementById("announcement_text").value.trim() || null,
        p_raffle_enabled: raffleCheckbox.checked,
        p_raffle_start: raffleCheckbox.checked ? parseInt(document.getElementById("raffle_start").value, 10) : null,
        p_raffle_end: raffleCheckbox.checked ? parseInt(document.getElementById("raffle_end").value, 10) : null,
      });
      createdMeetingId = result.meeting_id;
      await window.AmoyniMeetingPointRules.saveRules(
        window.AmoyniAPI.call,
        admin.admin_id,
        createdMeetingId,
        ruleValidation.rules,
        window.AmoyniDateTime.localDateTimeToIso
      );
      window.AmoyniUI.toast("تم إنشاء الاجتماع كمسودة", "success");
      window.location.href = "meeting-details.html?id=" + encodeURIComponent(createdMeetingId);
    } catch (err) {
      if (createdMeetingId) {
        const failedRule = typeof err.failedIndex === "number" ? err.failedIndex + 1 : 1;
        window.location.href = "meeting-details.html?id=" + encodeURIComponent(createdMeetingId) + "&rules_save_error=1&failed_rule=" + failedRule;
      } else {
        window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
      }
    } finally {
      window.AmoyniUI.setButtonLoading(submitBtn, false);
    }
  });

  updateRulesEmptyState();
})();
