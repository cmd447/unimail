# UniMail

A self-hosted bulk mailer. Point it at any SMTP account, load a list, write
a letter, send. Built to feel like a terminal — the app opens as a fake CMD
prompt (`/`). Type `website` if you'd rather click around.

Two front doors, same backend:

- `/` — command line in the browser. `login`, then `smtp add`, `import 1`,
  `blast cook`, `blast send 1`. `help` lists everything.
- `/app` — plain dark web UI. Same stuff, buttons instead of commands.

## What it does

- **SMTP rigs** — save multiple accounts (host/port/login/password),
  passwords stored AES-256-GCM, one-tap verify that actually opens a
  connection and authenticates
- **Leads** — CSV upload or straight paste (`email, first, last` per line),
  dedupe, disposable-domain and syntax checks, optional name-resolution
  via Hunter.io/Gravatar, name guessing from the address itself
  (`john.smith@…` → "John Smith")
- **Letters** — HTML + optional plain-text. `{{first_name}}`, `{{name}}`,
  `{{email}}`, `{{unsubscribe_url}}`, plus any custom CSV column becomes a
  tag. Every send renders fresh per recipient
- **Spam radar** — scores the letter 0-100 as you write: trigger phrases,
  hidden text, link shorteners, image-only mail, CAPS subjects, missing
  unsubscribe/postal address, Gmail's 102KB clip line, obfuscation tells.
  Most flags have a `[ fix ]` button that just rewrites the letter
- **Blasts** — send now, schedule, pause/resume/cancel. Per-blast
  overrides for rate limit, From name, Reply-To. Keeps going after you
  close the tab — sends happen server-side in a self-chaining tick loop
  (or through QStash if you set it up)
- **Logs** — every email gets a receipt: SMTP response code, envelope,
  message-id, timing, the rendered letter that actually went out
- **Deliverability ops** — RFC 8058 one-click unsubscribe headers,
  suppression list, IMAP bounce scanning that auto-suppresses dead
  addresses, daily cap, kill switch
- **Spam probe** — point it at a mailbox you own (Gmail works) and it
  fires a copy of each blast there, then IMAP-checks whether it landed in
  INBOX or Spam. Only way to actually know

## Stack

Next.js 15 (App Router + Turbopack), Firestore (firebase-admin, server
routes only), Nodemailer, optional Upstash QStash for the queue and
`imapflow` for bounce/probe scanning.

## Setup

```bash
cp .env.local.example .env.local   # fill it in
npm install
npm run dev
```

You need:

- A Firebase project with **Firestore enabled**
- Service account JSON on one line as `FIREBASE_SERVICE_ACCOUNT`
- `ADMIN_PASSWORD` — the whole login is just this password
- `ENCRYPTION_KEY` — 64 hex chars:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `APP_URL` — public base URL (unsubscribe links + queue callbacks)
- `CRON_SECRET` — any random hex; guards `/api/cron` and `/api/jobs/tick`

Optional: `QSTASH_TOKEN` for durable queue fan-out, `HUNTER_API_KEY` for
better name resolution.

## Deploy

Push to a repo, import into Vercel, copy the env vars over, set `APP_URL`
to the production URL. `vercel.json` registers a cron hitting `/api/cron`
(scheduled blasts, bounce scans, probe checks). Hobby-plan cron only runs
once a day — point a free scheduler (cron-job.org etc.) at the same URL
with `Authorization: Bearer <CRON_SECRET>` if you want it tighter.

## Notes

- Firestore rules ship deny-all — everything goes through the API routes,
  nothing touches the DB straight from the browser
- All queries avoid composite indexes, so nothing needs console index
  setup
- The repo was developed on an exFAT drive — `scripts/exfat-fs-patch.cjs`
  just swallows the transient EPERM file-lock errors AV scanners cause.
  On a normal filesystem it's harmless
