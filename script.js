const config = window.AMSA_CONFIG || {};

const form = document.querySelector("#signupForm");
const statusEl = document.querySelector("#formStatus");
const venmoHandle = document.querySelector("#venmoHandle");
const zelleHandle = document.querySelector("#zelleHandle");

venmoHandle.textContent = config.venmoHandle || "@AMSA-NYU";
zelleHandle.textContent = config.zelleHandle || "amsa@example.com";

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status${type ? ` is-${type}` : ""}`;
}

function getSelectedPaymentMethod() {
  return new FormData(form).get("paymentMethod");
}

function buildPayload() {
  const data = new FormData(form);

  return {
    fullName: data.get("fullName").trim(),
    email: data.get("email").trim().toLowerCase(),
    phone: data.get("phone").trim(),
    paymentMethod: getSelectedPaymentMethod(),
    paymentNote: data.get("paymentNote").trim(),
    paymentSent: data.get("paymentSent") === "on",
    honestyPolicy: data.get("honestyPolicy") === "on",
    submittedAt: new Date().toISOString()
  };
}

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
    setStatus(
      "Submitted. AMSA will review your payment and email credentials after approval.",
      "success"
    );
  } catch (error) {
    console.error(error);
    setStatus("Something went wrong. Please try again or contact AMSA.", "error");
  } finally {
    button.disabled = false;
  }
});
