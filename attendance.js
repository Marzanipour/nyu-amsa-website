const attendanceConfig = window.AMSA_CONFIG || {};
const attendanceForm = document.querySelector("#attendanceForm");
const attendanceStatus = document.querySelector("#attendanceStatus");
const attendanceCode = document.querySelector("#attendanceCode");

const codeFromLink = new URLSearchParams(window.location.search).get("code");
if (codeFromLink) {
  attendanceCode.value = codeFromLink.trim().toUpperCase();
}

function setAttendanceStatus(message, type = "") {
  attendanceStatus.textContent = message;
  attendanceStatus.className = `status${type ? ` is-${type}` : ""}`;
}

function submitAttendance(payload) {
  return new Promise((resolve, reject) => {
    const callbackName = `amsaAttendance_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Attendance check-in timed out."));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (response) => {
      cleanup();
      resolve(response);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Attendance service could not be reached."));
    };

    const params = new URLSearchParams({
      action: "attendance",
      callback: callbackName,
      fullName: payload.fullName,
      email: payload.email,
      eventCode: payload.eventCode
    });

    script.src = `${attendanceConfig.googleScriptUrl}?${params.toString()}`;
    document.body.appendChild(script);
  });
}

attendanceForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!attendanceForm.checkValidity()) {
    attendanceForm.reportValidity();
    return;
  }

  const data = new FormData(attendanceForm);
  const payload = {
    fullName: String(data.get("fullName") || "").trim(),
    email: String(data.get("email") || "").trim().toLowerCase(),
    eventCode: String(data.get("eventCode") || "").trim().toUpperCase()
  };

  if (!/^[A-Za-z0-9._%+-]+@nyu\.edu$/.test(payload.email)) {
    setAttendanceStatus("Please use your NYU email address.", "error");
    return;
  }

  const button = attendanceForm.querySelector("button");
  button.disabled = true;
  setAttendanceStatus("Checking the event code...");

  try {
    if (!attendanceConfig.googleScriptUrl) {
      setAttendanceStatus(
        "Attendance is in demo mode. Add the Google Apps Script URL in config.js.",
        "error"
      );
      return;
    }

    const response = await submitAttendance(payload);
    if (!response || !response.ok) {
      throw new Error(response?.error || "The event code is not valid.");
    }

    if (response.duplicate) {
      setAttendanceStatus(
        `You are already checked in for ${response.eventName}.`,
        "success"
      );
      return;
    }

    attendanceForm.reset();
    setAttendanceStatus(
      `Attendance recorded for ${response.eventName}. Thank you!`,
      "success"
    );
  } catch (error) {
    console.error(error);
    setAttendanceStatus(
      error.message || "Check-in failed. Confirm the room code and try again.",
      "error"
    );
  } finally {
    button.disabled = false;
  }
});
