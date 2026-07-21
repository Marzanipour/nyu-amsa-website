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
- `jobs.html`: public jobs page.
- `styles.css`: page design.
- `script.js`: form validation and submission.
- `listing-page.js`: renders event and job cards from data files.
- `config.js`: public settings.
- `data/events.js`: editable event list.
- `data/jobs.js`: editable job/opportunity list.
- `backend/google-apps-script.js`: Google Sheets and email backend.
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

## Update jobs

Edit `data/jobs.js`.

Example:

```js
window.AMSA_JOBS = [
  {
    title: "Research Assistant",
    type: "Research",
    date: "Posted September 1, 2026",
    location: "NYU Langone",
    description: "Part-time research support role for students interested in clinical research.",
    tags: ["Research", "Part-time"],
    link: "https://example.com"
  }
];
```
