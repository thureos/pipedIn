# pipedIn

A seaglass-inspired job application pipeline built with Vue 3, Pinia, Tailwind CSS 4, and free Lucide icons. All application data stays in your browser's localStorage. No account, backend database, analytics, or external fonts.

## Run with Docker

Install Docker with Compose and the Task CLI, then run:

```sh
task up
```

Open **http://localhost:5173**. `task down` stops the container; `task restart` stops, rebuilds, and starts it. Without Task, run `docker compose up --build -d` or `docker compose down` directly. The image builds the app with Node and serves static assets through nginx.

## Local development

With Node.js 22 or newer:

```sh
npm ci
npm run dev
```

`npm run build` creates `dist/`. `npm test` runs backup validation tests; `task test` runs them in Docker.

## Features

- Color application cards blue, orange, yellow, or green, or clear their color. Star applications directly on cards or in application details. Both settings persist on this device and in JSON backups and CSV exports.

- Six pipeline columns: Potential applications, Applied, Reached out, Interviews, Offer received, and Ended. Ended cards carry an Accepted, Declined, Rejected, or Withdrawn outcome.
- Drag cards between stages, or open a card and select its stage (also works on touch devices and with a keyboard).
- Company, location, industry, role, salary, work arrangement, application date, posting URL, and notes.
- Standard and custom perks, arbitrary custom attributes, and separate reasons for each terminal outcome.
- Multiple named interview rounds, interviewer details, dates, notes, and 1–5 star ratings.
- Search and work arrangement filters, application list, and interview list.
- Light and dark themes, responsive layout, keyboard-accessible dialogs, and storage error feedback.
- JSON export and validated restore in Settings & data. Restore replaces the existing dataset after confirmation.
- Optional Google Drive backup and restore, using an app-private Drive file when configured with a Google OAuth client ID.
- Optional fictional sample pipeline, available only when the workspace is empty. Delete all applications in Settings to clear it.

## Storage and metrics

Applications use `pipedin.applications.v1`; appearance uses `pipedin.theme`. Data is specific to the browser profile and origin (protocol, hostname, and port). Docker restarts do not remove browser data. Clearing site data does; export backups regularly. Private browsing may clear data when the session ends. No cross-device synchronization is provided.

## Google Drive setup

Google Drive backup is optional. Create a Google Cloud project, enable the Google Drive API, configure the OAuth consent screen, and create a Web application OAuth client. Add the app's local and production origins to the client's Authorized JavaScript origins, then set `VITE_GOOGLE_CLIENT_ID` either in a local `.env` file or in the environment that starts/builds Vite. An environment variable takes precedence over the `.env` value. The app requests the restricted `drive.appdata` scope and stores the backup in Drive's app-private data area. The app never receives the user's Google password and does not send application data to a pipedIn server.

Active applications are Applied, Reached out, Interviews, or Offer received. Offers counts current Offer received and Offer accepted applications. Response rate is the share currently in Reached out, Interviews, Offer received, Offer accepted, Offer declined, or Rejected; Withdrawn and Applied are excluded from the numerator. These metrics describe current stages, not historical transitions.

## Opportunity ages and timestamps

Potential applications is the first column: save an opportunity name and an HTTP(S) application link before applying. A job title is required when moving into an application stage. Potential applications are excluded from active applications, received offers, and the response-rate denominator.

Every newly saved application records creation, last update, and current-stage entry timestamps. Cards show total age and time in the current stage; column badges show the oldest known stage age among filtered cards. Ages refresh every 30 seconds. Editing a card preserves its stage age; moving it starts a new stage visit, recorded in the Activity history with a local date and time. Repeated visits are retained.

Existing backups remain compatible. Earlier versions did not record these timestamps, so legacy records show “Age unknown” / “Not recorded” until the relevant event occurs. Their original applied-on date is preserved. Export and restore retain all recorded timestamps and history.

## Import and export

Use **Import JSON**, **Export JSON**, or **Export CSV** above the pipeline or application list, or in Settings & data. Exports always include all applications regardless of search or filters. JSON is a complete backup including custom fields, interviews, timestamps and stage history; importing validates the file and asks before replacing existing applications. CSV is a spreadsheet-friendly list with one row per application, current status, link, company and role details, timestamps, and current outcome reason. CSV is for reporting, not backup restoration. Unknown timestamps are blank.

Employment type is available on applications and potential applications: Full-time, Part-time, Contract, Contract-to-hire, Temporary, Internship, Freelance, Apprenticeship, or Other. It appears on cards and in the application list, and is retained in JSON backups and CSV exports. Older records default to Not specified.

## Ended applications

Accepted, Declined, Rejected, and Withdrawn share the **Ended** column. Move a card there and choose its **Reason for ending**, with optional written details. Cards display the outcome and a preview of the explanation. Existing records appear in this column automatically, preserving their original outcomes, reasons, timestamps, and history. JSON and CSV exports retain the specific outcome; existing statistics continue to distinguish accepted offers and withdrawals.
# pipedIn
