const SETTINGS = {
  sheetName: "Membership",
  attendanceSheetName: "Attendance",
  attendanceControlSheetName: "Attendance Control",
  memberSummarySheetName: "Member Summary"
};

const PROPERTY_KEYS = {
  resourceEmail: "RESOURCE_EMAIL",
  resourcePassword: "RESOURCE_PASSWORD",
  replyToEmail: "REPLY_TO_EMAIL",
  adminEmail: "ADMIN_EMAIL",
  activeAttendanceEvent: "ACTIVE_ATTENDANCE_EVENT"
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

const ATTENDANCE_COLUMNS = [
  "Timestamp",
  "Event ID",
  "Event Name",
  "Full Name",
  "NYU Email",
  "Membership Found",
  "Payment Status"
];

const MEMBER_SUMMARY_COLUMNS = [
  "NYU Email",
  "Full Name",
  "Payment Status",
  "Events Attended",
  "Current Tier",
  "Tier Progress",
  "Last Attendance",
  "Membership Record"
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("AMSA Membership")
    .addItem("Configure credential emails", "configureMembershipSettings")
    .addItem("Enable automatic approval emails", "createApprovalTrigger")
    .addItem("Send approved credentials", "sendApprovedCredentials")
    .addSeparator()
    .addItem("Open attendance check-in", "openAttendanceCheckIn")
    .addItem("Close attendance check-in", "closeAttendanceCheckIn")
    .addItem("Refresh member summary", "rebuildMemberSummary")
    .addToUi();
}

function configureMembershipSettings() {
  const ui = SpreadsheetApp.getUi();
  const prompts = [
    [PROPERTY_KEYS.resourceEmail, "Resource account email", "Enter the Google account email students should receive."],
    [PROPERTY_KEYS.resourcePassword, "Resource account password", "Enter the password students should receive."],
    [PROPERTY_KEYS.replyToEmail, "Reply-to email", "Enter the AMSA email students may reply to."],
    [PROPERTY_KEYS.adminEmail, "Admin notification email", "Enter the email that should receive payment review notices."]
  ];
  const values = {};

  for (const [key, title, message] of prompts) {
    const response = ui.prompt(title, message, ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() !== ui.Button.OK) {
      ui.alert("No settings were changed.");
      return;
    }

    const value = response.getResponseText().trim();
    if (!value) {
      ui.alert(`${title} is required. No settings were changed.`);
      return;
    }
    values[key] = value;
  }

  PropertiesService.getScriptProperties().setProperties(values);
  ui.alert("Credential email settings are saved securely for this Apps Script project.");
}

function getEmailSettings() {
  const properties = PropertiesService.getScriptProperties();
  return {
    resourceEmail: properties.getProperty(PROPERTY_KEYS.resourceEmail) || "N/A",
    resourcePassword: properties.getProperty(PROPERTY_KEYS.resourcePassword) || "N/A",
    replyToEmail: properties.getProperty(PROPERTY_KEYS.replyToEmail) || "mja10021@nyu.edu",
    adminEmail: properties.getProperty(PROPERTY_KEYS.adminEmail) || "edn7702@nyu.edu"
  };
}

function requireCredentialSettings() {
  const settings = getEmailSettings();
  const missing = Object.entries(settings)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(
      "Credential email settings are incomplete. Use AMSA Membership > Configure credential emails."
    );
  }

  return settings;
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents);
    const normalized = normalizePayload(payload);

    const existingMemberRow = findExistingMemberRow(normalized.email);
    if (existingMemberRow) {
      if (normalized.paymentSent === "Yes") {
        updateExistingMemberPayment(existingMemberRow, normalized);
        notifyAdminForReview(normalized);
        rebuildMemberSummary(false);
        return jsonResponse({ ok: true, status: "payment_pending_review", updated: true });
      }
      return jsonResponse({ ok: true, duplicate: true });
    }

    appendPendingMembershipRow(normalized);
    if (normalized.paymentSent === "Yes") {
      notifyAdminForReview(normalized);
    }
    rebuildMemberSummary(false);

    return jsonResponse({
      ok: true,
      status: normalized.paymentSent === "Yes" ? "pending_review" : "joined"
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function doGet(event) {
  const callback = String(event.parameter.callback || "").trim();
  if (callback && !/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService
      .createTextOutput("Invalid callback")
      .setMimeType(ContentService.MimeType.TEXT);
  }

  let result;
  try {
    if (event.parameter.action !== "attendance") {
      throw new Error("Unknown request.");
    }
    result = recordAttendance(event.parameter);
  } catch (error) {
    result = { ok: false, error: error.message };
  }

  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${JSON.stringify(result)});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return jsonResponse(result);
}

function openAttendanceCheckIn() {
  const ui = SpreadsheetApp.getUi();
  const nameResponse = ui.prompt(
    "Open event attendance",
    "Enter the event name students should see after checking in.",
    ui.ButtonSet.OK_CANCEL
  );

  if (nameResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const eventName = nameResponse.getResponseText().trim();
  if (!eventName) {
    ui.alert("An event name is required.");
    return;
  }

  const durationResponse = ui.prompt(
    "Check-in window",
    "How many minutes should the room code remain active? Enter 15 if unsure.",
    ui.ButtonSet.OK_CANCEL
  );

  if (durationResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const durationMinutes = Number(durationResponse.getResponseText().trim());
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 180) {
    ui.alert("Enter a duration from 1 to 180 minutes.");
    return;
  }

  const now = new Date();
  const code = Utilities.getUuid().replace(/-/g, "").slice(0, 6).toUpperCase();
  const eventData = {
    id: `${Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd-HHmmss")}-${code}`,
    name: eventName,
    code,
    openedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + durationMinutes * 60000).toISOString(),
    active: true
  };

  PropertiesService.getScriptProperties().setProperty(
    PROPERTY_KEYS.activeAttendanceEvent,
    JSON.stringify(eventData)
  );
  updateAttendanceControlSheet(eventData);
  getAttendanceSheet();
  rebuildMemberSummary(false);

  ui.alert(
    `Attendance is open for ${eventName}.\n\nRoom code: ${code}\n\nThe code expires in ${durationMinutes} minute(s). Display the Attendance Control sheet in the room.`
  );
}

function closeAttendanceCheckIn() {
  const eventData = getActiveAttendanceEvent(false);
  if (!eventData) {
    SpreadsheetApp.getUi().alert("There is no active attendance window.");
    return;
  }

  eventData.active = false;
  eventData.closedAt = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty(
    PROPERTY_KEYS.activeAttendanceEvent,
    JSON.stringify(eventData)
  );
  updateAttendanceControlSheet(eventData);
  SpreadsheetApp.getUi().alert(`Attendance is closed for ${eventData.name}.`);
}

function getActiveAttendanceEvent(requireOpen) {
  const stored = PropertiesService.getScriptProperties().getProperty(
    PROPERTY_KEYS.activeAttendanceEvent
  );
  if (!stored) {
    if (requireOpen) {
      throw new Error("Attendance is not open right now.");
    }
    return null;
  }

  const eventData = JSON.parse(stored);
  const expired = Date.now() > new Date(eventData.expiresAt).getTime();
  if (requireOpen && (!eventData.active || expired)) {
    throw new Error("This attendance code has expired or check-in is closed.");
  }
  return eventData;
}

function recordAttendance(payload) {
  const fullName = String(payload.fullName || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const eventCode = String(payload.eventCode || "").trim().toUpperCase();

  if (!fullName) {
    throw new Error("Full name is required.");
  }
  if (!/^[A-Za-z0-9._%+-]+@nyu\.edu$/.test(email)) {
    throw new Error("A valid NYU email is required.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const eventData = getActiveAttendanceEvent(true);
    if (eventCode !== eventData.code) {
      throw new Error("That room code is not valid.");
    }

    const attendanceSheet = getAttendanceSheet();
    const existing = findAttendanceRow(attendanceSheet, eventData.id, email);
    if (existing) {
      return { ok: true, duplicate: true, eventName: eventData.name };
    }

    const member = findMembershipRecord(email);
    attendanceSheet.appendRow([
      new Date(),
      eventData.id,
      eventData.name,
      fullName,
      email,
      member ? "Yes" : "No",
      member ? member.paymentStatus : "Not found"
    ]);
    rebuildMemberSummary(false);
    sendTierTwoCredentialsIfEligible(email);

    return {
      ok: true,
      duplicate: false,
      eventName: eventData.name,
      membershipFound: Boolean(member),
      paymentStatus: member ? member.paymentStatus : "Not found"
    };
  } finally {
    lock.releaseLock();
  }
}

function getAttendanceSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SETTINGS.attendanceSheetName) ||
    spreadsheet.insertSheet(SETTINGS.attendanceSheetName);
  ensureSpecificHeaderRow(sheet, ATTENDANCE_COLUMNS);
  return sheet;
}

function findAttendanceRow(sheet, eventId, email) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return false;
  }

  const rows = sheet.getRange(2, 2, lastRow - 1, 4).getValues();
  return rows.some((row) => {
    return String(row[0]) === eventId && String(row[3]).trim().toLowerCase() === email;
  });
}

function findMembershipRecord(email) {
  const sheet = getMembershipSheet();
  ensureHeaderRow(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
  for (const row of rows) {
    if (String(row[2]).trim().toLowerCase() === email) {
      return {
        fullName: String(row[1] || "").trim(),
        email,
        paymentStatus: String(row[8] || "Pending").trim() || "Pending"
      };
    }
  }
  return null;
}

function updateAttendanceControlSheet(eventData) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SETTINGS.attendanceControlSheetName) ||
    spreadsheet.insertSheet(SETTINGS.attendanceControlSheetName);
  const expiresAt = new Date(eventData.expiresAt);
  const isOpen = eventData.active && Date.now() <= expiresAt.getTime();
  const values = [
    ["AMSA attendance", ""],
    ["Current event", eventData.name],
    ["ROOM CODE", isOpen ? eventData.code : "CLOSED"],
    ["Check-in closes", expiresAt],
    ["Status", isOpen ? "OPEN" : "CLOSED"],
    ["Student page", "Open the Attendance page on the AMSA website"],
    ["Officer note", "Display this sheet only while students are in the room."]
  ];

  sheet.getRange("A1:B1").breakApart();
  sheet.clear();
  sheet.getRange(1, 1, values.length, 2).setValues(values);
  sheet.getRange("A1:B1").merge().setValue("AMSA IN-ROOM ATTENDANCE");
  sheet.getRange("A1:B1").setBackground("#57068c").setFontColor("#ffffff").setFontWeight("bold");
  sheet.getRange("A3").setFontWeight("bold");
  sheet.getRange("B3").setFontSize(32).setFontWeight("bold").setFontColor(isOpen ? "#57068c" : "#c2410c");
  sheet.getRange("B4").setNumberFormat("mmm d, yyyy h:mm AM/PM");
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 420);
  sheet.setFrozenRows(1);
  sheet.activate();
}

function rebuildMemberSummary(showAlert) {
  const shouldAlert = showAlert !== false;
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const membershipSheet = getMembershipSheet();
  const attendanceSheet = getAttendanceSheet();
  const summarySheet = spreadsheet.getSheetByName(SETTINGS.memberSummarySheetName) ||
    spreadsheet.insertSheet(SETTINGS.memberSummarySheetName);
  const members = {};
  const attendance = {};

  const membershipLastRow = membershipSheet.getLastRow();
  if (membershipLastRow >= 2) {
    membershipSheet
      .getRange(2, 1, membershipLastRow - 1, COLUMNS.length)
      .getValues()
      .forEach((row) => {
        const email = String(row[2] || "").trim().toLowerCase();
        if (email) {
          members[email] = {
            fullName: String(row[1] || "").trim(),
            paymentStatus: String(row[8] || "Pending").trim() || "Pending"
          };
        }
      });
  }

  const attendanceLastRow = attendanceSheet.getLastRow();
  if (attendanceLastRow >= 2) {
    attendanceSheet
      .getRange(2, 1, attendanceLastRow - 1, ATTENDANCE_COLUMNS.length)
      .getValues()
      .forEach((row) => {
        const email = String(row[4] || "").trim().toLowerCase();
        if (!email) {
          return;
        }
        if (!attendance[email]) {
          attendance[email] = {
            fullName: String(row[3] || "").trim(),
            eventIds: {},
            lastAttendance: null
          };
        }
        attendance[email].eventIds[String(row[1])] = true;
        const timestamp = row[0] instanceof Date ? row[0] : new Date(row[0]);
        if (!attendance[email].lastAttendance || timestamp > attendance[email].lastAttendance) {
          attendance[email].lastAttendance = timestamp;
        }
      });
  }

  const emails = Object.keys(Object.assign({}, members, attendance)).sort();
  const rows = emails.map((email) => {
    const member = members[email];
    const visits = attendance[email];
    const eventsAttended = visits ? Object.keys(visits.eventIds).length : 0;
    const paymentStatus = member ? member.paymentStatus : "Not found";
    const paymentApproved = paymentStatus.toLowerCase() === "approved";
    let currentTier = "Not yet eligible";
    let tierProgress;

    if (!member) {
      tierProgress = "Join AMSA through the Membership page";
    } else if (eventsAttended < 3) {
      const remainingEvents = 3 - eventsAttended;
      tierProgress = `Attend ${remainingEvents} more event${remainingEvents === 1 ? "" : "s"}`;
    } else if (paymentApproved) {
      currentTier = "Tier II";
      tierProgress = "Tier II complete";
    } else {
      currentTier = "Tier I";
      tierProgress = "Submit and receive approval for the $25 dues to reach Tier II";
    }

    return [
      email,
      member ? member.fullName : visits.fullName,
      paymentStatus,
      eventsAttended,
      currentTier,
      tierProgress,
      visits ? visits.lastAttendance : "",
      member ? "Yes" : "No"
    ];
  });

  summarySheet.clearContents();
  summarySheet.getRange(1, 1, 1, MEMBER_SUMMARY_COLUMNS.length).setValues([MEMBER_SUMMARY_COLUMNS]);
  summarySheet.getRange(1, 1, 1, MEMBER_SUMMARY_COLUMNS.length)
    .setBackground("#57068c")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  if (rows.length) {
    summarySheet.getRange(2, 1, rows.length, MEMBER_SUMMARY_COLUMNS.length).setValues(rows);
    summarySheet.getRange(2, 7, rows.length, 1).setNumberFormat("mmm d, yyyy h:mm AM/PM");
  }
  summarySheet.setFrozenRows(1);
  summarySheet.autoResizeColumns(1, MEMBER_SUMMARY_COLUMNS.length);

  if (shouldAlert) {
    SpreadsheetApp.getUi().alert(`Member Summary refreshed for ${rows.length} student(s).`);
  }
}

function ensureSpecificHeaderRow(sheet, columns) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(columns);
  } else {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
  }
  sheet.getRange(1, 1, 1, columns.length)
    .setBackground("#57068c")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  sheet.setFrozenRows(1);
}

function normalizePayload(payload) {
  const fullName = String(payload.fullName || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const phone = String(payload.phone || "").trim();
  const membershipTrack = String(payload.membershipTrack || "free").trim().toLowerCase();

  if (!fullName) {
    throw new Error("Full name is required.");
  }

  if (!/^[A-Za-z0-9._%+-]+@nyu\.edu$/.test(email)) {
    throw new Error("A valid NYU email is required.");
  }

  if (!phone) {
    throw new Error("Phone number is required.");
  }

  if (membershipTrack === "paid" && payload.paymentSent !== true) {
    throw new Error("Payment confirmation is required.");
  }

  if (payload.honestyPolicy !== true) {
    throw new Error("Academic honesty agreement is required.");
  }

  return {
    fullName,
    email,
    phone,
    membershipTrack,
    paymentMethod: payload.paymentSent === true ? String(payload.paymentMethod || "") : "",
    paymentNote: String(payload.paymentNote || ""),
    paymentSent: payload.paymentSent === true ? "Yes" : "No",
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
    data.paymentSent === "Yes" ? "Pending" : "Not Paid",
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

  values.forEach((row) => {
    const paymentStatus = String(row[8] || "").trim().toLowerCase();
    const credentialSent = String(row[9] || "").trim().toLowerCase();

    if (paymentStatus === "approved" && credentialSent !== "yes") {
      if (sendTierTwoCredentialsIfEligible(String(row[2] || "").trim().toLowerCase())) {
        sentCount += 1;
      }
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

  console.log("Automatic approval emails are enabled.");
}

function sendCredentialsForApprovedEdit(event) {
  const range = event.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== SETTINGS.sheetName || range.getColumn() !== 9 || range.getRow() < 2) {
    return;
  }

  const paymentStatus = String(range.getValue() || "").trim().toLowerCase();
  const credentialSent = String(sheet.getRange(range.getRow(), 10).getValue() || "").trim().toLowerCase();

  rebuildMemberSummary(false);

  if (paymentStatus !== "approved" || credentialSent === "yes") {
    return;
  }

  const email = String(sheet.getRange(range.getRow(), 3).getValue() || "").trim().toLowerCase();
  sendTierTwoCredentialsIfEligible(email);
}

function notifyAdminForReview(data) {
  const settings = getEmailSettings();
  if (!settings.adminEmail) {
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

  GmailApp.sendEmail(settings.adminEmail, subject, body, {
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

function findExistingMemberRow(email) {
  const sheet = getMembershipSheet();
  ensureHeaderRow(sheet);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  const emails = sheet.getRange(2, 3, lastRow - 1, 1).getValues().flat();
  const index = emails.findIndex((value) => String(value).trim().toLowerCase() === email);
  return index === -1 ? 0 : index + 2;
}

function updateExistingMemberPayment(rowNumber, data) {
  const sheet = getMembershipSheet();
  const currentStatus = String(sheet.getRange(rowNumber, 9).getValue() || "").trim().toLowerCase();

  sheet.getRange(rowNumber, 1).setValue(new Date(data.submittedAt));
  sheet.getRange(rowNumber, 2).setValue(data.fullName);
  sheet.getRange(rowNumber, 4).setValue(data.phone);
  sheet.getRange(rowNumber, 5).setValue(data.paymentMethod);
  sheet.getRange(rowNumber, 6).setValue(data.paymentNote);
  sheet.getRange(rowNumber, 7).setValue("Yes");
  sheet.getRange(rowNumber, 8).setValue(data.honestyPolicy);

  if (currentStatus !== "approved") {
    sheet.getRange(rowNumber, 9).setValue("Pending");
  }
}

function sendTierTwoCredentialsIfEligible(email) {
  const rowNumber = findExistingMemberRow(email);
  if (!rowNumber || countUniqueEventsForEmail(email) < 3) {
    return false;
  }

  const sheet = getMembershipSheet();
  const row = sheet.getRange(rowNumber, 1, 1, COLUMNS.length).getValues()[0];
  const paymentStatus = String(row[8] || "").trim().toLowerCase();
  const credentialSent = String(row[9] || "").trim().toLowerCase();

  if (paymentStatus !== "approved" || credentialSent === "yes") {
    return false;
  }

  sendCredentialEmail({
    fullName: row[1],
    email: row[2]
  });
  sheet.getRange(rowNumber, 10).setValue("Yes");
  sheet.getRange(rowNumber, 11).setValue(new Date());
  return true;
}

function countUniqueEventsForEmail(email) {
  const sheet = getAttendanceSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }

  const rows = sheet.getRange(2, 2, lastRow - 1, 4).getValues();
  const eventIds = {};
  rows.forEach((row) => {
    if (String(row[3] || "").trim().toLowerCase() === email) {
      eventIds[String(row[0] || "")] = true;
    }
  });
  return Object.keys(eventIds).length;
}

function sendCredentialEmail(data) {
  const settings = requireCredentialSettings();
  const firstName = String(data.fullName || "").split(/\s+/)[0] || "there";
  const subject = "AMSA resource access credentials";
  const body = `Hello ${firstName},

Thank you for completing the form and agreeing to the academic honesty policy. We're excited to have you take the next steps with us!

As promised, here is the credential to access our exclusive resources. Please keep this information confidential, as sharing it could disrupt your access and make the process more challenging for everyone.

Your Credential:

Email: ${settings.resourceEmail}
Password: ${settings.resourcePassword}

Important: To access the resources, sign into a new Google account using the provided credentials. Once signed in, use the shortcuts set up in this profile to navigate to the tools you need. Please do not use the email to log into platforms directly. Instead, always access resources through the Google profile by selecting "Sign in with Google" where applicable.

Thank you for your cooperation. We look forward to seeing you at the event and to your continued participation!

AMSA at NYU`;

  GmailApp.sendEmail(data.email, subject, body, {
    replyTo: settings.replyToEmail,
    name: "AMSA at NYU"
  });
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
