# pipedIn

A seaglass-inspired job application pipeline built with Vue 3, Pinia, Tailwind CSS 4, and free Lucide icons. Application data stays in your browser's localStorage. The optional job URL importer uses a small same-origin Node service; it does not store application data or fetched pages.

## Run with Docker

Install Docker with Compose and the Task CLI, then run:

```sh
task up
```

Open **http://localhost:5173**. `task down` stops the container; `task restart` stops, rebuilds, and starts it. Without Task, run `docker compose up --build -d` or `docker compose down` directly. The production image serves the built app and API together on port `8080` with Node.

## Local development

With Node.js 22 or newer:

```sh
npm ci
npm run dev
```

`npm run build` creates `dist/`. `npm test` runs backup validation tests; `task test` runs them in Docker.

## Project structure

- `src/app/`: top-level Vue application and page composition.
- `src/components/`: reusable interface components.
- `src/domain/`: application data shape, defaults, and validation rules.
- `src/services/`: Google Drive, sharing, and job-posting integrations.
- `src/stores/`: Pinia state and local persistence.
- `src/styles/`: global and feature-specific stylesheets.
- `src/utils/`: configuration and export helpers.
- `server/`: same-origin job-ingest API and production static-file server.
- `public/`: static policy pages and deployment assets; `tests/`: automated unit and service tests.

## Features

- Color application cards blue, orange, yellow, or green, or clear their color. Star applications directly on cards or in application details. Both settings persist on this device and in JSON backups and CSV exports.

- Six pipeline columns: Potential applications, Applied, Reached out, Interviews, Offer received, and Ended. Ended cards carry an Accepted, Declined, Rejected, or Withdrawn outcome.
- Drag cards between stages, or open a card and select its stage (also works on touch devices and with a keyboard).
- Company, location, industry, role, minimum and maximum salary, insurance coverage, direct or recruiter channel, work arrangement, application date, posting URL, and notes.
- Standard and custom perks, arbitrary custom attributes, and separate reasons for each terminal outcome.
- Multiple named interview rounds, interviewer details, dates, notes, and 1–5 star ratings.
- Search and work arrangement filters, application list, and interview list.
- Light and dark themes, responsive layout, keyboard-accessible dialogs, and storage error feedback.
- JSON export and validated restore in Settings & data. Restore replaces the existing dataset after confirmation.
- Share an application from its details: copy its posting URL or copy the complete application as Base64 JSON. Receive a Base64 application or paste a job URL to open the ingested data in the application modal. Review or complete the details and add notes before choosing Save application; closing the modal discards the draft. Base64 shares start in Potential applications. Job pages are fetched by the same-origin Node service, not directly by the browser.
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

Salary minimum and maximum are entered in thousands (for example, `50` displays as `$50K`) and validated as an ordered range. Insurance coverage can be Poor, Decent, Excellent, or Total. Hiring channel defaults to Direct and can be changed to Through Recruiter. These fields are retained in JSON backups and CSV exports.

### Job URL service and security

The browser posts a URL to the same-origin `/api/job-posting` endpoint. The service fetches the HTML, parses embedded JSON-LD or schema.org microdata, and returns only the extracted `JobPosting` fields; it does not persist URLs, HTML, or application data. The job URL and the service's outbound request are visible to the pipedIn server operator and the target website. Direct browser CORS restrictions no longer apply, though target sites can still deny or rate-limit server requests.

The HTML parser handles script attribute variations, multiple JSON-LD blocks, arrays and nested graphs, schema.org type URLs, and local `@id` references across blocks. Malformed blocks and postings without titles do not prevent another usable posting from importing. When multiple postings exist, a matching posting URL is preferred, then a posting with a company name and description. Microdata uses `itemscope`, `itemtype`, `itemprop`, and local `itemref` attributes. Common HTML entities are decoded in imported text. Compressed HTML (gzip, deflate, Brotli) is supported with limits on both compressed and decoded size.

The importer does not execute JavaScript, fetch external JSON-LD contexts, or render pages in a browser. Schema added only after JavaScript runs, RDFa, login walls, and anti-bot pages are not supported. The error message offers manual entry when no usable embedded posting is available. Missing optional data is left for review rather than inferred from prose or the hostname.

If a posting omits its hiring organization name, the importer opens a draft with the company field blank. Enter the company before saving; saved applications still require it.

The fetcher only allows HTTP(S) on standard web ports, rejects private/reserved IP ranges, resolves and pins public DNS addresses, repeats those checks for every redirect, and caps redirects, response size, request time, request-body size, concurrency, and per-IP request rate. The endpoint also requires a same-origin JSON POST and emits no CORS headers. These controls reduce SSRF and resource-exhaustion risk; they do not make an unauthenticated public endpoint abuse-proof. For a public multi-user deployment, add edge-level rate limiting or authentication and network egress controls. The in-process rate limit resets on restart and is not shared across replicas.

## Ended applications

Accepted, Declined, Rejected, and Withdrawn share the **Ended** column. Move a card there and choose its **Reason for ending**, with optional written details. Cards display the outcome and a preview of the explanation. Existing records appear in this column automatically, preserving their original outcomes, reasons, timestamps, and history. JSON and CSV exports retain the specific outcome; existing statistics continue to distinguish accepted offers and withdrawals.

# pipedIn
