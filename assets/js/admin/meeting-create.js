(function () {
  const admin = window.AmoyniAdminNav.mount("meetings", "إنشاء اجتماع");
  if (!admin) return;

  const form = document.getElementById("create-meeting-form");
  const submitBtn = document.getElementById("create-submit");
  const raffleCheckbox = document.getElementById("raffle_enabled");
  const raffleFields = document.getElementById("raffle-range-fields");

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
    if (hasError) return;

    window.AmoyniUI.setButtonLoading(submitBtn, true);
    try {
      const result = await window.AmoyniAPI.call("create_meeting", {
        p_admin_session_token: admin.session_token,
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
      window.AmoyniUI.toast("تم إنشاء الاجتماع كمسودة", "success");
      window.location.href = "meeting-details.html?id=" + result.meeting_id;
    } catch (err) {
      window.AmoyniUI.toast(window.AmoyniUI.friendlyError(err), "error");
    } finally {
      window.AmoyniUI.setButtonLoading(submitBtn, false);
    }
  });
})();
