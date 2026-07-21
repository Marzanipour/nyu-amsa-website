const SETTINGS = {
  sheetName: "Membership",
  resourceEmail: "replace-with-resource-account@gmail.com",
  resourcePassword: "replace-with-password",
  replyToEmail: "replace-with-your-club-email@nyu.edu",
  adminEmail: "replace-with-officer-email@nyu.edu"
};

const COLUMNS = [
  "Timestamp",
  "Full Name",
  "NYU Email",
  "Phone Number",
  "Payment Method",
  "Payment Note",
  "Payment Sent",
  "Academic Honesty Agreement",
  "Payment Status",
  "Credential Email Sent",
  "Credential Email Sent At"
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("AMSA Membership")
    .addItem("Enable automatic approval emails", "createApprovalTrigger")
    .addItem("Send approved credentials", "sendApprovedCredentials")
    .addToUi();
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents);
    const normalized = normalizePayload(payload);

    if (hasExistingMember(normalized.email)) {
      return jsonResponse({ ok: true, duplicate: true });
    }

    appendPendingMembershipRow(normalized);
    notifyAdminForReview(normalized);

    return jsonResponse({ ok: true, status: "pending_review" });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function normalizePayload(payload) {
  const fullName = String(payload.fullName || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const phone = String(payload.phone || "").trim();

  if (!fullName) {
    throw new Error("Full name is required.");
  }

  if (!/^[A-Za-z0-9._%+-]+@nyu\.edu$/.test(email)) {
    throw new Error("A valid NYU email is required.");
  }

  if (!phone) {
    throw new Error("Phone number is required.");
  }

  if (payload.paymentSent !== true) {
    throw new Error("Payment confirmation is required.");
  }

  if (payload.honestyPolicy !== true) {
    throw new Error("Academic honesty agreement is required.");
  }

  return {
    fullName,
    email,
    phone,
    paymentMethod: String(payload.paymentMethod || ""),
    paymentNote: String(payload.paymentNote || ""),
    paymentSent: "Yes",
    honestyPolicy: "Yes",
    submittedAt: payload.submittedAt || new Date().toISOString()
  };
}

function appendPendingMembershipRow(data) {
  const sheet = getMembershipSheet();
  ensureHeaderRow(sheet);

  sheet.appendRow([
    new Date(data.submittedAt),
    data.fullName,
    data.email,
    data.phone,
    data.paymentMethod,
    data.paymentNote,
    data.paymentSent,
    data.honestyPolicy,
    "Pending",
    "No",
    ""
  ]);
}

function sendApprovedCredentials() {
  const sheet = getMembershipSheet();
  ensureHeaderRow(sheet);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert("No membership rows found.");
    return;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
  let sentCount = 0;

  values.forEach((row, index) => {
    const rowNumber = index + 2;
    const paymentStatus = String(row[8] || "").trim().toLowerCase();
    const credentialSent = String(row[9] || "").trim().toLowerCase();

    if (paymentStatus === "approved" && credentialSent !== "yes") {
      const data = {
        fullName: row[1],
        email: row[2]
      };

      sendCredentialEmail(data);
      sheet.getRange(rowNumber, 10).setValue("Yes");
      sheet.getRange(rowNumber, 11).setValue(new Date());
      sentCount += 1;
    }
  });

  SpreadsheetApp.getUi().alert(`Sent ${sentCount} credential email(s).`);
}

function createApprovalTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  const alreadyExists = triggers.some((trigger) => {
    return trigger.getHandlerFunction() === "sendCredentialsForApprovedEdit";
  });

  if (!alreadyExists) {
    ScriptApp.newTrigger("sendCredentialsForApprovedEdit")
      .forSpreadsheet(SpreadsheetApp.getActive())
      .onEdit()
      .create();
  }

  SpreadsheetApp.getUi().alert("Automatic approval emails are enabled.");
}

function sendCredentialsForApprovedEdit(event) {
  const range = event.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== SETTINGS.sheetName || range.getColumn() !== 9 || range.getRow() < 2) {
    return;
  }

  const paymentStatus = String(range.getValue() || "").trim().toLowerCase();
  const credentialSent = String(sheet.getRange(range.getRow(), 10).getValue() || "").trim().toLowerCase();

  if (paymentStatus !== "approved" || credentialSent === "yes") {
    return;
  }

  const row = sheet.getRange(range.getRow(), 1, 1, COLUMNS.length).getValues()[0];

  sendCredentialEmail({
    fullName: row[1],
    email: row[2]
  });

  sheet.getRange(range.getRow(), 10).setValue("Yes");
  sheet.getRange(range.getRow(), 11).setValue(new Date());
}

function notifyAdminForReview(data) {
  if (!SETTINGS.adminEmail || SETTINGS.adminEmail.includes("replace-with")) {
    return;
  }

  const subject = `AMSA payment review needed: ${data.fullName}`;
  const body = `A new AMSA membership submission is ready for payment review.

Name: ${data.fullName}
NYU Email: ${data.email}
Phone: ${data.phone || "Not provided"}
Payment Method: ${data.paymentMethod}
Payment Note: ${data.paymentNote || "Not provided"}

After confirming the Venmo/Zelle payment, open the Membership sheet, change Payment Status to Approved, then use AMSA Membership > Send approved credentials.`;

  GmailApp.sendEmail(SETTINGS.adminEmail, subject, body, {
    replyTo: data.email,
    name: "AMSA Membership Bot"
  });
}

function getMembershipSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const existing = spreadsheet.getSheetByName(SETTINGS.sheetName);
  return existing || spreadsheet.insertSheet(SETTINGS.sheetName);
}

function ensureHeaderRow(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    return;
  }

  const headers = sheet.getRange(1, 1, 1, COLUMNS.length).getValues()[0];
  const alreadyConfigured = COLUMNS.every((column, index) => headers[index] === column);

  if (!alreadyConfigured) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
  }
}

function hasExistingMember(email) {
  const sheet = getMembershipSheet();
  ensureHeaderRow(sheet);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return false;
  }

  const emails = sheet.getRange(2, 3, lastRow - 1, 1).getValues().flat();
  return emails.some((value) => String(value).trim().toLowerCase() === email);
}

function sendCredentialEmail(data) {
  const firstName = String(data.fullName || "").split(/\s+/)[0] || "there";
  const subject = "AMSA resource access credentials";
  const body = `Hello ${firstName},

Thank you for completing the form and agreeing to the academic honesty policy. We're excited to have you take the next steps with us!

As promised, here is the credential to access our exclusive resources. Please keep this information confidential, as sharing it could disrupt your access and make the process more challenging for everyone.

Your Credential:

Email: ${SETTINGS.resourceEmail}
Password: ${SETTINGS.resourcePassword}

Important: To access the resources, sign into a new Google account using the provided credentials. Once signed in, use the shortcuts set up in this profile to navigate to the tools you need. Please do not use the email to log into platforms directly. Instead, always access resources through the Google profile by selecting "Sign in with Google" where applicable.

Thank you for your cooperation. We look forward to seeing you at the event and to your continued participation!

AMSA at NYU`;

  GmailApp.sendEmail(data.email, subject, body, {
    replyTo: SETTINGS.replyToEmail,
    name: "AMSA at NYU"
  });
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
