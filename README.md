# AMSA NYU Membership Site

This is a simple membership access website for AMSA at NYU.

## What it does

- Collects a student's full name and NYU email.
- Collects a required phone number to help match Venmo/Zelle payments.
- Requires them to confirm they sent the one-time $25 Venmo or Zelle payment.
- Tells students to include their full name in the Venmo/Zelle payment note.
- Sends the submission to a Google Sheet as `Pending`.
- Emails the AMSA admin that a payment needs review.
- Sends the student the credential email only after a row is marked `Approved`.
- Records event attendance using short-lived in-room codes.
- Matches each check-in to membership and payment status by NYU email.
- Maintains a `Member Summary` tab with payment status and unique events attended.
- Calculates Tier I and Tier II automatically from membership, attendance, and approved dues.

## Important payment note

Venmo and Zelle do not give this kind of simple website a reliable payment-completed webhook. This version records that the student says payment was sent, then waits for an AMSA officer to confirm the payment in the Google Sheet. If fully automatic payment verification is required, use a payment processor such as Stripe.

Text-message confirmation is possible, but it requires an SMS provider such as Twilio. Google Apps Script can send emails by itself; it cannot reliably send SMS to phone numbers without a separate paid SMS service.

## Set up the website

1. Edit `config.js`.
2. Replace `venmoHandle` and `zelleHandle`.
3. Leave `googleScriptUrl` blank while testing the form locally.

Open `index.html` in a browser to preview the page.

## Set up Google Sheets and email automation

1. Create a new Google Sheet.
2. In the Sheet, go to **Extensions > Apps Script**.
3. Paste the contents of `backend/google-apps-script.js`.
4. Replace these values at the top of the script:
   - `resourceEmail`
   - `resourcePassword`
   - `replyToEmail`
   - `adminEmail`
5. Deploy the script as a web app:
   - Click **Deploy > New deployment**.
   - Choose **Web app**.
   - Execute as: **Me**.
   - Who has access: **Anyone**.
6. Copy the web app URL.
7. Paste that URL into `googleScriptUrl` in `config.js`.

After that, each form submission should add a pending row to the `Membership` sheet and notify the admin email.

## Approve payments and send credentials

There are two ways to send credentials after checking Venmo/Zelle.

### Automatic approval emails

1. Open the Google Sheet.
2. Use the new menu: **AMSA Membership > Enable automatic approval emails**.
3. When a payment is confirmed, change that student's `Payment Status` cell from `Pending` to `Approved`.
4. The credential email will send automatically and the row will update to `Credential Email Sent = Yes`.

### Manual batch send

1. Change one or more `Payment Status` cells to `Approved`.
2. Use **AMSA Membership > Send approved credentials**.
3. Any approved row that has not already received credentials will be emailed.

## Files

- `index.html`: public About landing page.
- `membership.html`: public sign-up and membership payment page.
- `events.html`: public events page.
- `attendance.html`: public, code-protected event check-in page.
- `tiers.html`: public explanation of Tier I and Tier II requirements and benefits.
- `styles.css`: page design.
- `script.js`: form validation and submission.
- `attendance.js`: validates and submits attendance check-ins.
- `listing-page.js`: renders event cards from the event data file.
- `config.js`: public settings.
- `data/events.js`: editable event list.
- `backend/google-apps-script.js`: Google Sheets, email, and attendance backend.
- `assets/amsa-study-hero.png`: generated hero image for the site.

## Update events

Edit `data/events.js`. Leave it as an empty array when there are no events.

Example:

```js
window.AMSA_EVENTS = [
  {
    title: "Medical School Application Workshop",
    type: "Workshop",
    date: "September 12, 2026",
    time: "6:00 PM",
    location: "NYU Kimmel Center",
    description: "A peer-led session on timelines, personal statements, and recommendation letters.",
    tags: ["Pre-med", "Applications"],
    link: "https://example.com"
  }
];
```

## Run event attendance

After replacing the Apps Script code and updating the existing deployment:

1. Refresh the Google Sheet.
2. Choose **AMSA Membership > Open attendance check-in**.
3. Enter the event name and the number of minutes the code should remain active. Fifteen minutes is recommended.
4. Display the new `Attendance Control` tab in the room.
5. Students open the website's **Attendance** page and enter the displayed room code with their name and NYU email.
6. Choose **AMSA Membership > Close attendance check-in** when the window is over.

The backend rejects expired or incorrect codes and prevents the same NYU email from checking into an event twice. The `Attendance` tab stores the event and membership match. The `Member Summary` tab combines each student's payment status and count of unique events attended.

No browser-only method can absolutely prove physical presence: location can be spoofed, browsers cannot inspect the NYU Wi-Fi name, and a student could share a code. A code shown only in the room for a short window is the best low-friction option for this site. For higher-stakes attendance, an officer should also visually supervise check-in or display the code near the end of the event.
