# Back-End

English · [Português](README-PT.md)

> This is one half of a pair: this API and the web app in
> [Front-End](https://github.com/tiagomsilva432/Front-End) are designed to work
> together. Clone both side by side.

The API of an ERP for a software company: people, projects and allocations,
salaries and peer reviews, absences and holidays, expenses and a finance
dashboard, a kanban board, chat and file uploads per project, announcements and
live notifications.

Express 5 · TypeORM · PostgreSQL 18 · TypeScript (ESM) · Zod.

The full API reference is generated from the code and served at
**`/docs`** (in Portuguese, like every user-facing message). This README covers
setup and how the system fits together; it does not list every endpoint.

**Contents**

1. [Quick start (Docker)](#quick-start-docker)
2. [Running the API on the host](#running-the-api-on-the-host)
3. [Configuration](#configuration)
4. [How it works](#how-it-works)
5. [Important data shapes](#important-data-shapes)
6. [Key endpoints](#key-endpoints)
7. [Live updates and files](#live-updates-and-files)
8. [Scripts](#scripts)
9. [Tests](#tests)
10. [Production](#production)

---

## Quick start (Docker)

The recommended way on every OS: Windows, macOS (Intel or Apple Silicon) and
Linux run exactly the same stack. All images are multi-arch.

**You need:** Git and Docker Desktop (or Docker Engine with Compose v2). Nothing
else on the host.

### 1. Clone

Clone the two repositories next to each other, with these folder names. The
API does not need the frontend, but the production stack expects it there.

```bash
git clone https://github.com/tiagomsilva432/Back-End.git
git clone https://github.com/tiagomsilva432/Front-End.git
cd Back-End
```

### 2. Create `.env` (optional)

Compose has a default for every variable, so the stack starts without a
`.env`. Create one to change ports, enable real email, etc. (`cp` also works in
PowerShell, where it is an alias of `Copy-Item`):

```bash
cp .env.example .env
```

The database user and password are fixed when the database volume is first
created. If you change `DB_USER`, `DB_PASSWORD` or `DB_NAME` afterwards (the
example file uses `root`, the built-in default is `postgres`), reset the volume
with `docker compose down -v`.

### 3. Start

```bash
docker compose up --build
```

This starts two containers:

| Container | Host port | What it is |
| --- | --- | --- |
| `db` | `5433` | PostgreSQL 18, data in the `db_data` volume |
| `api` | `3000` | the API in watch mode; runs the migrations first |

The first build takes a few minutes. When the log shows
`Server a correr em: http://localhost:3000`, open:

- http://localhost:3000/health → `200`
- http://localhost:3000/docs → the API reference (needs internet: the page
  loads its viewer from a CDN; `/docs.json` works offline)

If port 3000 or 5433 is taken, set `API_EXPOSED_PORT` or `DB_EXPOSED_PORT` in
`.env`. If you move the API, also set `API_PUBLIC_URL=http://localhost:<port>`
(so the "Try it" requests in `/docs` go to the right place) and the frontend's
`VITE_API_URL`.

The migrations also create a first company, **My Software Company**, and the
shared skills catalog. No users are created.

### 4. Create the first admin

The first `system_admin` cannot come from the API, so it is created from the
shell. The same command works in zsh and PowerShell:

```bash
docker compose exec api npm run admin:create -- --email=admin@example.com --password='Admin@2026'
```

The password needs 8+ characters with an uppercase letter, a lowercase letter,
a digit and one of `@$!%*?&#`. Keep the single quotes: `!` and `$` mean
something to zsh and PowerShell. The admin joins the only company; with
several, add `--company-id=<uuid>`.

### 5. Log in

In `/docs`, open **Auth → POST /auth/login**, send the email and password, and
use the `token` it returns as the Bearer token for the other requests.

### 6. Invite people

`POST /auth/account/create` creates an account in `invited` and emails an
activation link. Without SMTP configured, emails are **printed to the API log**
instead of sent:

```bash
docker compose logs -f api
```

The link points at the frontend (`FE_URL/auth/account/activate?token=…`).
Without the frontend, take the token from the link and call
`POST /auth/account/activate` with `{ "signupToken": "<token>", "password": "<password>" }`.

### Day to day

| | |
| --- | --- |
| Code changes | picked up automatically (the container polls `src/`, which works on Windows and macOS bind mounts) |
| New migrations | `docker compose restart api` |
| `package.json` changed | `docker compose up -d --build -V api` (`-V` replaces the old `node_modules` volume) |
| Stop, keep the data | `docker compose down` |
| Stop and wipe the database | `docker compose down -v` |
| Open `psql` | `docker compose exec db psql -U postgres -d erp_ossilvas_dev` |

### With the frontend

The frontend runs on the host with Node.js 24. In the `Front-End` folder:

```bash
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173. Its `.env` points at `http://localhost:3000`, and
the API allows that origin through `CORS_ORIGINS` (without a `.env`, the API
allows any origin in development).

---

## Running the API on the host

For a debugger or a faster loop. **You need Node.js 24** (the version in the
Dockerfile and CI) and a PostgreSQL 18 database.

```bash
npm install
```

Create `.env` as in step 2 and point it at the database:

- **The database from Compose** (`docker compose up -d db`): set
  `DB_HOST=localhost` and `DB_PORT=5433`. The user and password are the ones the
  volume was created with.
- **A local PostgreSQL 18:** `DB_PORT=5432`, your credentials, and create the
  database first (`createdb -U postgres erp_ossilvas_dev`). Version 18 is
  required: primary keys default to `uuidv7()`.

Then:

```bash
npm run db:migrate
npm run admin:create -- --email=admin@example.com --password='Admin@2026'
npm run dev
```

---

## Configuration

Everything is read from the environment (`.env` locally). `.env.example` lists
the variables with comments.

| Variable | Default | |
| --- | --- | --- |
| `PORT` | `3000` | |
| `NODE_ENV` | — | `production` hides 5xx details and closes CORS to the allowlist |
| `FE_URL` | `http://localhost:5173` | base of the links in emails |
| `CORS_ORIGINS` | — | comma-separated; empty = any origin in dev, none in production |
| `API_PUBLIC_URL` | `BASE_URL:PORT` | where `/docs` sends its "Try it" requests |
| `DB_HOST` · `DB_PORT` | `localhost` · `5432` | Compose sets `db` · `5432` inside the network |
| `DB_USER` · `DB_PASSWORD` · `DB_NAME` | `postgres` · `postgres` · `erp` | Compose defaults the name to `erp_ossilvas_dev` |
| `JWT_SECRET` | — | **required** |
| `JWT_EXPIRES_IN` | `1d` | with a unit (`12h`, `1d`); a bare number is milliseconds |
| `BCRYPT_ROUNDS` | `12` | |
| `SIGNUP_TOKEN_EXPIRATION_DAYS` | `7` | activation links |
| `PASSWORD_RESET_EXPIRATION_HOURS` | `1` | reset links |
| `UPLOADS_DIR` | `uploads` | relative to where the API runs |
| `FILE_URL_TTL_MINUTES` | `60` | signed file links last between this and twice this |
| `SMTP_HOST` | — | **empty = emails go to the log** |
| `SMTP_PORT` · `SMTP_USER` · `SMTP_PASSWORD` | `587` · — · — | `465` uses implicit TLS |
| `MAIL_FROM` | `nao-responder@localhost` | must be an address your provider allows |
| `MAIL_ALLOW_COMPANY_FROM` | `false` | `true` sends from each company's email; only if all are verified |
| `DB_EXPOSED_PORT` · `API_EXPOSED_PORT` | `5433` · `3000` | Compose only: the ports on the host |

**Email.** The SMTP account is the real sender, so by default the company appears
as the sender's name and `Reply-To` while `MAIL_FROM` is the address. Two setups
that work without a domain: Gmail with an App Password (`smtp.gmail.com:587`) or
Brevo's free tier with a verified sender (`smtp-relay.brevo.com:587`).

---

## How it works

### Layout

```
src/
  routes/        Express routers, plus the OpenAPI description of their paths
  controllers/   request in, response out; access checks
  services/      business rules: policies, finance, holidays, files, realtime, mailer
  repositories/  TypeORM queries
  entities/      the schema, as TypeORM entities
  dtos/          Zod schemas: they validate requests and generate /docs
  middleware/    auth, roles, validation, uploads, errors, CORS, request log
  migrations/    the only way the schema changes (synchronize is off)
  scripts/       admin:create, files:sweep, check-sharp
tests/           Jest + supertest against a real PostgreSQL
deploy/          Caddy, the production web image, up/update/backup scripts
```

### A request

```
cors → express.json → request log
  → requireAuth     verifies the JWT
  → requireRole     reloads the user: inactive or mustChangePassword → 403
  → validateBody / validateQuery   Zod; a bad field → 400 with field errors
  → controller      scope and permission checks, then the work
  → { status, message, code, data }      (errors use the same envelope)
```

`requireRole` reads the account from the database on every request, so a
suspension takes effect on the very next call, not when the token expires.

### Tenancy and roles

Every account belongs to one company, and its token carries that `companyId`.
The same email can exist in several companies; the password picks the account
(see login below).

| Role | Creates | Sees |
| --- | --- | --- |
| `system_admin` | `company_admin`s, in any company | every company (passes `?companyId=`) |
| `company_admin` | `employee`s, in its company | its company |
| `employee` | — | its company; edits only what is its own |

An id outside the caller's reach answers **404, not 403**, so the API never
confirms that something exists in another company.

A few rules that shape the UI:

- Salaries, peer-review results and absence details (a sick day shows as
  `absent`) are private to the person and whoever administers them.
- Project chat, resources and the task board belong to the project's members:
  the people allocated to it, its manager and the company's admins.
- On the board, a card's title and description are edited by its creator, the
  manager or an admin; its deadline, priority, tags and files also by its
  assignee; other members can claim an unassigned card and comment. Only the
  manager or an admin approves a card into `done`. The rules live in
  `src/services/task-workflow.ts`.
- Terminating an account ends its salary and allocations that day.

### Conventions

- **Ids** are uuidv7, so they sort by creation time; paginated lists use the
  last id as the cursor (`?before=`).
- **Dates** are `YYYY-MM-DD`, and "today" is always the date in Lisbon, whatever
  the server's time zone. Timestamps are ISO 8601 in UTC.
- **Money** travels as a string with two decimals (`"1249.90"`).
- **`PATCH`** merges: a missing field stays as it is and `null` clears it.
  **`PUT`** replaces.

---

## Important data shapes

Every response, success or error:

```json
{ "status": 200, "message": "Login bem sucedido", "code": "SUCCESS_OK", "data": { } }
```

A `400` lists the fields to mark in a form (sent in production too):

```json
{ "status": 400, "message": "Dados inválidos", "code": "BAD_REQUEST",
  "data": [{ "field": "email", "message": "E-mail inválido" }] }
```

**Login.** `POST /auth/login` with `{ email, password }` returns
`{ token, user: { id, email, role } }`. The token's claims are
`{ sub, companyId, role }`. If the password opens accounts in two companies it
answers `409` with the choice, and the client repeats the login with `companyId`:

```json
{ "status": 409, "code": "CONFLICT", "message": "…",
  "data": [{ "companyId": "0193…", "companyName": "ACME Software" }] }
```

**Files** (avatars, receipts, absence documents, project resources, task
attachments) come back inside their owner as:

```json
{ "id": "0193…", "kind": "expense_receipt", "name": "fatura.pdf",
  "mimeType": "application/pdf", "size": 48213,
  "url": "http://localhost:3000/files/0193…?exp=1793664000&sig=…",
  "uploadedBy": "0193…", "createdAt": "2026-10-24T09:30:00.000Z", "duplicateOwnerIds": [] }
```

**Notifications:**

```json
{ "id": "0193…", "type": "allocation.created",
  "message": "Tem uma nova alocação no projeto Website (50%)",
  "data": { "projectId": "0193…", "projectName": "Website" },
  "readAt": null, "createdAt": "2026-10-24T09:30:00.000Z" }
```

---

## Key endpoints

The rest, with bodies, responses and permission rules, is in `/docs`.

| Endpoint | |
| --- | --- |
| `GET /docs` · `GET /docs.json` | the API reference · the same as OpenAPI 3.1 |
| `GET /health` · `GET /health/db` | the server is up · it can reach the database |
| `POST /auth/login` · `GET /auth/me` | log in · who the token belongs to |
| `POST /auth/account/create` · `POST /auth/account/activate` | invite someone · set the password from the email link |
| `POST /auth/password/reset` · `POST /auth/password/reset/confirm` | request and confirm a password reset |
| `GET /users` | the company directory, each user with its profile |
| `GET /projects` · `GET /projects/{id}` | projects of the company |
| `GET /projects/{id}/tasks` | the board: four columns of cards |
| `POST /projects/{id}/tasks/{taskId}/move` | drag a card: `{ status, position }` |
| `GET /calendar?from=&to=` | holidays and absences in a range |
| `GET /finance/overview` | the finance dashboard (admins) |
| `GET /notifications/mine` | the inbox, newest first |
| `POST /notifications/stream-ticket` · `GET /notifications/stream` | the live stream (see below) |

**A new company** is onboarded in three steps: the `system_admin` creates it
(`POST /companies`), invites its `company_admin` (`POST /auth/account/create`
with that `companyId`), and that admin activates the account and invites the
employees.

---

## Live updates and files

**Server-Sent Events.** A browser's `EventSource` cannot send an
`Authorization` header, so the client first trades its token for a single-use
ticket (`POST /notifications/stream-ticket`, valid 30 s) and opens
`GET /notifications/stream?ticket=…`. Events: `ready`, `notification`,
`announcement`, `project_message`, `project_task`, `project_task_comment`, and
`close` with a reason. A ticket works once, so the client reconnects itself with
a new one. Open streams live in memory: this works with **one** API process.

**Uploads** are `multipart/form-data` with the file in a field called `file`,
sent to the resource that owns it (e.g. `POST /expenses/{id}/receipts`). The
type is read from the bytes, images are re-encoded without metadata, and each
file comes back with a signed `url` that needs no token and expires after an
hour or two. Read it from the resource each time instead of storing it. Files
are stored under `UPLOADS_DIR`.

---

## Scripts

| Script | |
| --- | --- |
| `npm run dev` | watch mode, no build |
| `npm run build` · `npm start` | compile to `dist/` · build and run it |
| `npm test` · `npm run test:watch` | the test suite (needs Docker) |
| `npm run test:types` | type-check `src/` and `tests/` |
| `npm run lint` · `npm run lint:fix` | Biome |
| `npm run db:migrate` · `npm run db:revert` | apply the pending migrations · undo the last one |
| `npm run db:generate -- src/migrations/Name` | write a migration from the entity changes (read it before running it) |
| `npm run db:check` | fail if the entities and the migrations disagree |
| `npm run admin:create -- --email=… --password='…'` | create a `system_admin` |
| `npm run files:sweep` | delete files whose owner is gone |

Inside the Docker stack, prefix them with `docker compose exec api`.

---

## Tests

```bash
npm install
npm test
```

Docker must be running; nothing else to set up. The suite starts its own
`postgres:18-alpine` on a random port (Testcontainers), runs the migrations, and
removes it at the end. The first run pulls the image. Docker Desktop works out
of the box on Windows and macOS; with Colima or similar, point `DOCKER_HOST` at
its socket.

Every test runs inside a transaction that is rolled back, so tests never see each
other's data. When writing one:

- use `repo(Entity)` or `manager()` from `tests/setup/db.ts`, or the
  repositories in `src/`; never `AppDataSource.query()`, which escapes the
  test's transaction;
- do not add `resetMocks` or `restoreMocks` to `jest.config.mjs`;
- the mailer and the realtime hub are spied in `tests/helpers/`;
- uploads go to a temporary folder that is emptied after each test.

CI (`.github/workflows/ci.yml`) runs lint, types, build, the migration drift
check, the tests, both Docker images and a boot of the compiled build.

---

## Production

One server, four containers: `db`, `migrate` (runs the migrations, then exits),
`api`, and `web` (Caddy: HTTPS, the built frontend, and `/api` proxied to the
API). Uploads live in the `uploads` volume.

On a fresh Ubuntu server with ports 22, 80 and 443 open:

```bash
curl -fsSL https://get.docker.com | sh
mkdir -p /srv/erp && cd /srv/erp
git clone https://github.com/tiagomsilva432/Back-End.git
git clone https://github.com/tiagomsilva432/Front-End.git
cd Back-End && cp deploy/env.prod.example .env.prod
```

Fill in `.env.prod`. `PUBLIC_URL` is the public address with its protocol;
without a domain, use the server's IP through sslip.io
(`https://203-0-113-10.sslip.io`). Then:

```bash
sh deploy/up.sh
docker compose --env-file .env.prod -f compose.prod.yaml exec api npm run admin:create:prod -- --email=<email> --password='<password>'
docker compose --env-file .env.prod -f compose.prod.yaml exec api node dist/scripts/check-sharp.js
```

The last command checks image processing on that machine; it should print
`… linux-x64: OK`.

| | |
| --- | --- |
| Update | `sh deploy/update.sh` (pulls both repositories and redeploys) |
| Logs | `docker compose --env-file .env.prod -f compose.prod.yaml logs -f api` |
| Daily backup | `0 3 * * * /bin/sh /srv/erp/Back-End/deploy/backup.sh` in `crontab -e` |

The backup writes `backups/erp-<date>.dump` and `backups/uploads-<date>.tar.gz`
and keeps 7 days. Restore both together: a database without its uploads has
receipts that 404.

### The production stack on your machine

```bash
cp deploy/env.prod.example .env.prod
```

In `.env.prod`, set `PUBLIC_URL=http://localhost`, `HTTP_PORT=8080` and
`HTTPS_PORT=8443` (so nothing needs ports 80 or 443), and any values for
`DB_PASSWORD` and `JWT_SECRET`. Then start it. This is the one command that
differs, because PowerShell has no `sh`:

macOS (zsh):

```bash
sh deploy/up.sh
```

Windows (PowerShell):

```powershell
docker compose --env-file .env.prod -f compose.prod.yaml up -d --build
```

Open http://localhost:8080.
