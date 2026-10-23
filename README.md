# Back-End

ERP backend for a software company: users, projects, allocations, salaries,
skills and peer salary reviews.

Express 5 + TypeORM + PostgreSQL, written in TypeScript (ESM).

---

## Requirements

- **Node.js 20+** (developed on 24)
- **PostgreSQL 18+** - every primary key defaults to `uuidv7()`, which is built in from 18
- **Docker**, running, for the test suite

## Setup

```bash
npm install
```

Copy the example env file and adjust it to your local Postgres:

```bash
cp .env.example .env
```

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `BASE_URL` | `http://localhost` | used only for the startup log |
| `FE_URL` | `http://localhost:5173` | base of the frontend, used to build the activation link |
| `DB_HOST` / `DB_PORT` | `localhost` / `5432` | |
| `DB_USER` / `DB_PASSWORD` | `postgres` / `postgres` | |
| `DB_NAME` | `erp` | the example file uses `erp_ossilvas_dev` |
| `DB_LOGGING` | `false` | set `true` to log every SQL statement |
| `JWT_SECRET` | - | required |
| `JWT_EXPIRES_IN` | `1d` | how long an access token lasts |
| `BCRYPT_ROUNDS` | `12` | the test suite drops this to 4 to stay fast |
| `CORS_ORIGINS` | - | comma-separated allowlist. Empty allows any origin in dev and none in production |
| `NODE_ENV` | - | `production` hides internal error details; anything else is treated as dev |
| `SIGNUP_TOKEN_EXPIRATION_DAYS` | `7` | how long an activation link stays valid |
| `PASSWORD_RESET_EXPIRATION_HOURS` | `1` | how long a password-reset link stays valid |
| `ADMIN_PASSWORD` | - | only read by `admin:create`, see Accounts and roles |
| `SMTP_HOST` | - | **empty = emails go to the console instead of being sent** |
| `SMTP_PORT` | `587` | `465` switches to implicit TLS |
| `SMTP_USER` / `SMTP_PASSWORD` | - | omit both for a server that needs no auth |
| `MAIL_FROM` | `nao-responder@localhost` | the sender address; must be one your SMTP provider authorises |
| `MAIL_ALLOW_COMPANY_FROM` | `false` | `true` sends from `companies.email` — see below |

### Sending real emails

The activation link is emailed on account creation, whatever the role: every
account is born in `invited` with a signup token.

The `From:` header is only a label: the SMTP account is the real sender, and
receiving servers check SPF/DKIM against the From **domain**. Gmail rewrites a
From it did not authorise; other providers reject it. So an arbitrary
`companies.email` cannot be the From address.

By default the company is therefore the *display name* and the `Reply-To`, while
`MAIL_FROM` is the actual address — this always delivers. Set
`MAIL_ALLOW_COMPANY_FROM=true` only once each company address is verified with
your provider; then `companies.email` becomes the real From.

Two setups that work without owning a domain:

- **Gmail** — enable 2-step verification, generate an App Password, and use
  `smtp.gmail.com:587` with that password. ~500/day.
- **Brevo** — free tier, 300/day. Verify a sender under *Senders & IPs* and use
  `smtp-relay.brevo.com:587`. Several addresses can be verified, which is what
  makes `MAIL_ALLOW_COMPANY_FROM=true` viable.

Create the database, then apply the migrations:

```bash
createdb -U postgres erp_ossilvas_dev
```

```bash
npm run db:migrate
```

Start it in watch mode:

```bash
npm run dev
```

## The API

Four routes need no token, and the first one is where to start:

| Endpoint | What it is |
| --- | --- |
| `GET /docs` | the whole API, browsable, generated from the Zod schemas |
| `GET /docs.json` | the same thing as an OpenAPI 3.1 document |
| `GET /health` | the server is up |
| `GET /health/db` | the server can reach the database; 503 if it cannot |

`/docs` is the reference: every endpoint below is documented there with its
request body, its responses and its permission rules, and it cannot drift
because it is built from the same schemas that validate the requests.

Everything else needs `Authorization: Bearer <token>` from `POST /auth/login`.
`GET /auth/me` returns the account that token belongs to.

Errors and successes share one envelope:

```json
{ "status": 400, "message": "Dados inválidos", "code": "BAD_REQUEST", "data": [ ... ] }
```

On a `400` the `data` array carries `{ field, message }` per bad field, which is
what a form should read to mark its inputs. Those field errors are returned in
production too; only `5xx` details are held back to dev.

---

## Accounts and roles

Three roles, and each one only creates the role below it:

| Role | Can create | Where |
| --- | --- | --- |
| `system_admin` | `company_admin` | any company |
| `company_admin` | `employee` | own company only |
| `employee` | nobody | - |

`POST /auth/account/create` is authenticated, so the first `system_admin` cannot
come from the API. It is created from the shell instead:

```bash
ADMIN_PASSWORD='troca-isto' npm run admin:create -- --email=chefe@empresa.pt
```

It attaches to the only existing company unless you pass `--company-id`, and it
refuses a password that would fail the activation rules. Run `db:migrate` first.

Onboarding a new company is therefore always three steps:

1. `POST /companies` as the `system_admin`.
2. `POST /auth/account/create` with that `companyId` - creates the
   `company_admin` and emails it an activation link.
3. That admin sets its password through `POST /auth/account/activate` with the
   token from the link, logs in, and creates its own employees. `companyId` is
   taken from its token, so it cannot reach another company.

An invite may carry the person's name, in an optional `profile` block
(`firstName`, `lastName`, and optionally `hireDate` - defaulting to today - and
`jobTitle`). It is worth sending: without it the account has no name anywhere,
and the directory can only show its email. The rest of the profile - phone,
address, birth date, avatar - is filled in later through
`PUT /users/{id}/profile`.

A `system_admin` cannot mint another `system_admin` over HTTP - only
`admin:create` does that.

### Logging in

`POST /auth/login` takes an email and a password. Email is unique *per company*,
so the same address may hold accounts at two companies; the login picks the one
the password opens - the password, in effect, selects the tenant.

If one password opens accounts at more than one company, it answers **409** and
lists them, sorted by name:

```json
{
  "status": 409,
  "message": "Este email existe em mais do que uma empresa: repete o login com o companyId",
  "code": "CONFLICT",
  "data": [
    { "companyId": "0193...", "companyName": "ACME Software" },
    { "companyId": "0194...", "companyName": "Globex" }
  ]
}
```

The client shows a picker and repeats the login with the chosen `companyId`.
Listing the companies leaks nothing: you only reach the 409 by having already
proved the password against every account in it, and a wrong password gets the
same uniform 401 as an unknown email.

One token carries one company. There is no switching - working in two companies
means logging in twice.

### People, projects and companies

`POST /projects` follows the same scoping rule: a `company_admin` creates in its
own company, a `system_admin` names the `companyId`, and an `employee` cannot
create one at all. A `managerId`, if given, has to belong to the same company -
both an unknown user and one from another company answer the same, so the
endpoint never confirms a foreign user exists.

Reading is wider than writing:

| Endpoint | Who | Scope |
| --- | --- | --- |
| `GET /projects` | any active account | own company; a `system_admin` passes `?companyId=`. Also takes `?status=` |
| `GET /projects/{id}` | any active account | own company |
| `GET /companies` | `system_admin` only | every company - it is the tenant directory |
| `GET /companies/{id}` | any active account | own company; a `system_admin` reads any |
| `GET /users` | any active account | own company; a `system_admin` passes `?companyId=`. Also takes `?role=` and `?status=` |
| `GET /users/{id}` | any active account | own company |
| `GET /users/{id}/profile` | any active account | own company |

Each user in `GET /users` carries its `profile` inline, or `null` when there is
none, so one request is enough to draw a directory. No response ever carries
`passwordHash`, `signupToken` or `signupTokenExpiresAt`.

Writing a profile is narrower than reading one:

| Endpoint | Who |
| --- | --- |
| `PUT /users/{id}/profile` | the person themselves, a `company_admin` over its own company, or a `system_admin` |

An `employee` editing a colleague gets 403 - the id is already visible in the
directory, so there is nothing left to hide. It is a `PUT`, so it replaces: an
optional field left out of the body is cleared to `null`. It answers 201 when it
creates the profile and 200 when it updates one.

Anything outside the caller's reach answers **404, not 403** - a 403 would
confirm the id exists. The same applies to an id that is not a uuid.

Projects and companies are changed with a `PATCH`, which merges like the
allocation one below:

| Endpoint | Who |
| --- | --- |
| `PATCH /projects/{id}` | `system_admin`, `company_admin` over its own company |
| `PATCH /companies/{id}` | `system_admin`, `company_admin` over its own company - but only a `system_admin` changes `taxId` |

A project's company never changes. Its dates are checked against what is already
stored, and a new `managerId` has to be in the project's company.

### Suspending and terminating accounts

| Endpoint | Who |
| --- | --- |
| `PATCH /users/{id}/status` | whoever could administer that account, never on itself |

`active` and `suspended` go back and forth; anything can become `terminated`,
which is final. An `invited` account can only become `terminated`, which revokes
the invite - suspending it would not stop the activation link, which ignores the
status. A suspended account is refused on its very next request, because
`requireRole` reads the status from the database rather than from the token.

### Allocations

Who works on which project, at what percent. `Allocation` has no `companyId` of
its own, so its scope is the company of its **project**.

| Endpoint | Who | Scope |
| --- | --- | --- |
| `POST /allocations` | `system_admin`, `company_admin` | the user and the project must be in the same company |
| `PATCH /allocations/{id}` | `system_admin`, `company_admin` | own company |
| `DELETE /allocations/{id}` | `system_admin`, `company_admin` | own company |
| `GET /projects/{id}/allocations` | any active account | own company; takes `?open=true` |
| `GET /users/{id}/allocations` | any active account | own company; takes `?open=true` |
| `GET /users/{id}/allocation-load` | any active account | own company |

A user may hold only **one open allocation per project** - a second one answers
409. Supplying an `endDate` up front is accepted even when an open one exists,
because the constraint only covers open rows and back-filling past work is
legitimate. Closing an allocation means giving it an `endDate`.

Going over 100% is **allowed**. Nothing in the schema forbids it and real
staffing overlaps, so the write stays silent and
`GET /users/{id}/allocation-load` reports `totalPercent` and `overAllocated`.

`PATCH` merges, which is the opposite of the profile `PUT`: a field left out of
the body is **unchanged**, and an explicit `null` clears it. `startDate` is not
mutable - delete the allocation and create another. `DELETE` is for correcting a
mistake; ending real work is closing it with an `endDate`, which keeps the history.

### Skills

The catalog in `skills` has no `companyId`: it is **shared by every company**,
seeded by the `SeedBaseData` migration. People's skills live in `employee_skills`.

| Endpoint | Who | Scope |
| --- | --- | --- |
| `GET /skills` | any active account | the whole catalog; takes `?category=` |
| `POST /skills` | `system_admin` only | the catalog is everyone's |
| `PATCH /skills/{id}` | `system_admin` only | |
| `GET /skills/{id}/users` | any active account | own company; a `system_admin` passes `?companyId=` |
| `GET /users/{id}/skills` | any active account | own company |
| `PUT /users/{id}/skills/{skillId}` | whoever could administer that account, **never on itself** | own company |
| `DELETE /users/{id}/skills/{skillId}` | the same as the `PUT` | own company |

A skill name is unique **ignoring case**, so `react` cannot sit next to `React`.

Skills are not self-declared. They feed staffing decisions, so a person cannot
set their own - not even a `system_admin` - and a `company_admin` sets them for
its `employee`s, not for another `company_admin`. The `PUT` replaces like the
profile one: `proficiency` (1-5) or `yearsExperience` left out is cleared to
`null`, and `{}` assigns the skill with no level.

There is no `DELETE /skills/{id}`: removing a catalog entry would cascade
through every company's people at once.

### Salaries

Salaries are the one thing a colleague **cannot** read. Everything else about a
person is visible to their whole company; this is not.

| Endpoint | Who |
| --- | --- |
| `GET /users/{id}/salaries` | the person themselves, or whoever could administer that account |
| `GET /users/{id}/salaries/current` | the same |
| `POST /users/{id}/salaries` | whoever could administer that account, **never on itself** |
| `DELETE /users/{id}/salaries/{salaryId}` | the same as the `POST`, and only the most recent salary |

A salary is never edited, only followed by the next one: `POST` closes the open
row on the day the new one starts (`effectiveTo` is exclusive - it is the day
the next salary begins) and inserts the new one, in **one transaction**, because
the partial unique index allows only one open row and halfway through the person
would have none. History is not rewritten, so `effectiveFrom` has to be after
the most recent salary's, or it answers 409.

An `effectiveFrom` in the future schedules a raise. `/current` is the salary
**paid today**, not the most recent row, so a scheduled raise shows up there only
on its first day.

`DELETE` is for correcting a mistake: it removes the most recent salary and
reopens the previous one, if that is the one it had closed. Deleting from the
middle of the history would leave a gap, so it answers 409.

### Peer reviews

Colleagues vote on whether someone deserves a raise. Admins collect the votes
through review **cycles** - or one-off **ad-hoc** requests - and read the results
anonymously.

| Endpoint | Who |
| --- | --- |
| `POST /review-cycles` | `system_admin`, `company_admin` - own company; a `system_admin` names `companyId` |
| `GET /review-cycles` | the same; takes `?open=true` |
| `GET /review-cycles/{id}` | the same - the cycle plus how many requests are in each status |
| `GET /review-cycles/{id}/requests` | the same - who reviews whom and the status, never the content |
| `POST /review-cycles/{id}/close` | the same |
| `GET /review-cycles/{id}/results` | the same, narrowed to the people whose results the caller may read |
| `POST /review-requests` | `system_admin`, `company_admin` - an ad-hoc request outside any cycle |
| `GET /review-requests/mine` | any active account - its own inbox; takes `?status=` |
| `POST /review-requests/{id}/review` | the request's reviewer only |
| `POST /review-requests/{id}/decline` | the request's reviewer only |
| `GET /users/{id}/review-summary` | whoever could administer that account, **never the person** |
| `GET /users/{id}/reviews` | the same |

**Pairing.** Opening a cycle creates, in one transaction, a request for every
pair of coworkers: two **active** people allocated to the same project whose
allocations overlapped at some point between `since` (default: six months ago)
and today. Each pair yields two requests, one each way. Employees and
`company_admin`s alike take part. The cycle's `deadline` becomes each request's
`dueDate`.

**Answering.** A reviewer answers or declines only its own `pending` requests;
anyone else's answers 404, so a request id confirms nothing. A request past its
`dueDate` turns `expired` on the first attempt and answers 409. Closing a cycle
expires everything still pending in it. A review is final once submitted.

**Anonymity.** Results never say who wrote what. `GET /users/{id}/reviews`
returns the score, the raise vote and the comments, but no `reviewerId` and no
`requestId` - the request id would lead straight back to the reviewer through
`/review-cycles/{id}/requests`. It carries the day but not the time, and is
sorted by score rather than by time, so the order does not reveal who answered
when.

**Who sees results.** The same rule as salaries: whoever could administer the
account, never the person themselves. A `company_admin` who took part in a cycle
does not see its own row in the cycle's results, nor another `company_admin`'s.

### Recovering an account

| Endpoint | Who |
| --- | --- |
| `POST /auth/account/{id}/resend-activation` | whoever could administer that account |
| `POST /auth/password/change` | the account itself |
| `POST /auth/password/reset` | anyone, unauthenticated |
| `POST /auth/password/reset/confirm` | anyone holding a valid reset token |

An activation link expires after `SIGNUP_TOKEN_EXPIRATION_DAYS`. Resending is
the only way back: the account still occupies its `(company, email)` pair, so
creating it again answers 409. Resending works **only on an `invited` account** -
re-minting a token for an active one would hand the requester a way in, since
the activation URL is logged.

`POST /auth/password/change` is deliberately **not** behind `requireRole`. That
middleware rejects any account carrying `mustChangePassword` with a 403, which is
exactly the account that needs to change its password, so it checks the token and
the account status itself instead. The access token is not rotated, so the same
token keeps working - and once the flag clears it passes everywhere again with no
new login.

Note what that does **not** cover: `POST /auth/login` also refuses an account
carrying `mustChangePassword`, so this endpoint only helps someone who already
holds a token from before the flag was set. An account flagged while logged out
cannot log in and cannot reach this endpoint either - that one recovers through
the password reset below, which clears the flag.

Password reset has **its own token** (`passwordResetToken`), separate from the
activation one and valid for an hour rather than a week. The two are never
interchangeable, and the confirm step writes only the password: a suspended
account can reset its password and is still suspended afterwards, so a reset
grants nothing. `POST /auth/password/reset` always answers 200 with the same
body, whether the email matched nothing, one account or several - it is not an
oracle for which addresses exist. An account that never activated has no
password to reset and is skipped; that one is recovered by resend-activation.

---

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | watch mode via tsx, no build step |
| `npm run build` | compile TypeScript to `dist/` |
| `npm start` | build, then run the compiled output |
| `npm run lint` | Biome |
| `npm run lint:fix` | Biome, writing the fixes |
| `npm run admin:create -- --email=<email>` | create the first `system_admin` |
| `npm run db:migrate` | apply pending migrations |
| `npm run db:revert` | roll back the most recent migration |
| `npm run db:generate -- src/migrations/SomeName` | diff entities against the DB and write a migration |
| `npm run db:check` | fail if the entities and the migrations disagree |
| `npm run test:types` | type-check `src/` and `tests/` without running anything |

Read what `db:generate` writes before running it: it does not drop tables whose
entity was deleted, and it does not always honour constraint names declared on
the entity.

After changing an entity, run `db:check` against a migrated database before
pushing.

---

## Tests

```bash
npm test
```

Docker has to be running. There is nothing else to set up: the suite starts its
own `postgres:18-alpine` on a random port and throws it away at the end.

| Script | What it does |
| --- | --- |
| `npm test` | the full suite against a real PostgreSQL |
| `npm run test:watch` | the same, re-running on save |
| `npm run test:types` | type-check `src/` and `tests/` (the SWC transform does not) |

### Writing tests

- Reach for the database through `repo(Entity)` from `tests/setup/db.ts`, or
  through the methods in `src/repositories/`. Both are bound to the test's
  transaction.
- Use the `sql` helper from that same file for raw queries.
- Do **not** use `AppDataSource.query()`: it takes a separate connection from
  the pool and cannot see what the test just wrote.
- Do **not** add `resetMocks` or `restoreMocks` to `jest.config.mjs`. Both
  destroy the seam that binds repositories to the transaction.
- The mailer is stubbed through `resetMailSpies()` in `tests/helpers/mailer-spy.ts`,
  called once in the `beforeEach`. A new `mailer` method needs its spy added there
  and nowhere else.

Every test runs inside a transaction that is rolled back, so no test can see
another's writes and no cleanup code is needed. `jest.config.mjs` documents the
setup in full.
