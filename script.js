const config = window.AMSA_CONFIG || {};

const form = document.querySelector("#signupForm");
const statusEl = document.querySelector("#formStatus");
const venmoHandle = document.querySelector("#venmoHandle");
const zelleHandle = document.querySelector("#zelleHandle");
const membershipTrackInputs = document.querySelectorAll('input[name="membershipTrack"]');
const paymentFields = document.querySelector("#paymentFields");
const paymentNoteField = document.querySelector("#paymentNoteField");
const paymentConfirmationField = document.querySelector("#paymentConfirmationField");
const paymentSentInput = document.querySelector("#paymentSent");
const membershipSubmitLabel = document.querySelector("#membershipSubmitLabel");

venmoHandle.textContent = config.venmoHandle || "@edward_novodvorsky";
zelleHandle.textContent = config.zelleHandle || "347-705-4391";

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status${type ? ` is-${type}` : ""}`;
}

function getSelectedPaymentMethod() {
  return new FormData(form).get("paymentMethod");
}

function getMembershipTrack() {
  return new FormData(form).get("membershipTrack") || "free";
}

function updateMembershipPath() {
  const isPaid = getMembershipTrack() === "paid";
  const paymentOnlySections = [paymentFields, paymentNoteField, paymentConfirmationField];

  paymentOnlySections.forEach((section) => {
    section.hidden = !isPaid;
    section.querySelectorAll("input").forEach((input) => {
      input.disabled = !isPaid;
    });
  });

  paymentSentInput.required = isPaid;
  if (!isPaid) {
    paymentSentInput.checked = false;
  }
  membershipSubmitLabel.textContent = isPaid ? "Submit dues for review" : "Join AMSA";
}

function buildPayload() {
  const data = new FormData(form);
  const membershipTrack = getMembershipTrack();

  return {
    membershipTrack,
    fullName: data.get("fullName").trim(),
    email: data.get("email").trim().toLowerCase(),
    phone: data.get("phone").trim(),
    paymentMethod: membershipTrack === "paid" ? getSelectedPaymentMethod() : "",
    paymentNote: membershipTrack === "paid" ? data.get("paymentNote").trim() : "",
    paymentSent: membershipTrack === "paid" && data.get("paymentSent") === "on",
    honestyPolicy: data.get("honestyPolicy") === "on",
    submittedAt: new Date().toISOString()
  };
}

membershipTrackInputs.forEach((input) => {
  input.addEventListener("change", updateMembershipPath);
});
updateMembershipPath();

async function submitToGoogleScript(payload) {
  await fetch(config.googleScriptUrl, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const payload = buildPayload();

  if (!/^[A-Za-z0-9._%+-]+@nyu\.edu$/.test(payload.email)) {
    setStatus("Please use your NYU email address.", "error");
    return;
  }

  const button = form.querySelector("button");
  button.disabled = true;
  setStatus("Submitting your access request...");

  try {
    if (!config.googleScriptUrl) {
      console.info("AMSA form payload:", payload);
      setStatus(
        "Demo mode: add your Google Apps Script URL in config.js to send this to Sheets for review.",
        "success"
      );
      return;
    }

    await submitToGoogleScript(payload);
    form.reset();
    updateMembershipPath();
    setStatus(
      payload.membershipTrack === "paid"
        ? "Submitted. AMSA will review your dues for Tier II eligibility."
        : "You joined AMSA. Attend three events to qualify for Tier I.",
      "success"
    );
  } catch (error) {
    console.error(error);
    setStatus("Something went wrong. Please try again or contact AMSA.", "error");
  } finally {
    button.disabled = false;
  }
});
