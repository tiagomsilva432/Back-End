# Back-End

ERP backend for a software company: users, projects, allocations, salaries,
skills, peer salary reviews, announcements, and a calendar of absences and
holidays.

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
`GET /auth/me` returns the account that token belongs to. The one exception is
`GET /notifications/stream`: it is a Server-Sent Events stream, outside the
envelope below, and it also accepts a single-use `?ticket=` instead of the
header (see [Notifications](#notifications)).

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

The manager is also the one `employee` who may post announcements on that
project (see [Announcements](#announcements)), and is notified on becoming it.

### Suspending and terminating accounts

| Endpoint | Who |
| --- | --- |
| `PATCH /users/{id}/status` | whoever could administer that account, never on itself |

`active` and `suspended` go back and forth; anything can become `terminated`,
which is final. An `invited` account can only become `terminated`, which revokes
the invite - suspending it would not stop the activation link, which ignores the
status. A suspended account is refused on its very next request, because
`requireRole` reads the status from the database rather than from the token.
Its live notification stream is cut at once too, with `event: close` and the
reason `account_inactive`.

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

Allocating someone notifies them, and so does closing or changing their
allocation. `DELETE` notifies nobody: it is a correction, not news. Neither does
back-filling an allocation that has already ended.

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

**Notifications.** Only ad-hoc requests tell the admin who asked when they are
submitted or declined - in a cycle that would be one notification per review,
and the cycle's progress already shows it. `review.submitted` carries only the
`revieweeId`: no request id, no reviewer and no content, because the request id
and the time together would point at the reviewer. The reviewee is never
notified, even when an admin requested a review of themselves.

### Announcements

One-way messages. The `scope` decides who sees one:

| Scope | Who sees it | Who posts, edits and deletes it |
| --- | --- | --- |
| `system` | everyone, in every company | `system_admin` only |
| `company` | everyone in that company | a `system_admin` (naming `companyId`), or a `company_admin` of that company |
| `project` | the people involved, in their feed; anyone in the company, on the project page | the two above, or the project's manager (`managerId`) |

"Involved" means an allocation that has not ended yet - open, or with an
`endDate` today or later - plus the project's manager.

| Endpoint | What it is |
| --- | --- |
| `POST /announcements` | post one; `scope` picks the body (`companyId` for `company`, `projectId` for `project`) |
| `GET /announcements/mine` | the caller's feed: active `system`, own `company` and involved `project` announcements, each with `read`; takes `?unread=true` |
| `GET /projects/{id}/announcements` | the project page, for anyone in the project's company; `?includeInactive=true` counts only for whoever manages it |
| `GET /announcements` | the management list: what the caller may edit. Takes `?scope=`, `?companyId=` (`system_admin`), `?projectId=`, `?includeInactive=true` |
| `GET /announcements/{id}` | one announcement, with `read` |
| `PATCH /announcements/{id}` | title, body, severity, pinned and window; merges like the other `PATCH`es |
| `DELETE /announcements/{id}` | deletes it, and its reads |
| `POST /announcements/{id}/read` | marks it read, or dismisses a banner; repeating it changes nothing |

**Window.** `startsAt` (default: now) and `endsAt` (default: none) bound when it
shows, so a maintenance warning can go up ahead of time and come down on its
own. Outside its window an announcement exists only for those who manage it; to
anyone else a scheduled one answers 404. Times need an offset (`Z` or `+01:00`).
`severity` is `info`, `warning` or `critical`, and `pinned` ones sort first.

**Live.** Posting, editing or deleting an active announcement pushes it to the
same audience through the [notification stream](#notifications), as
`event: announcement`. There is no scheduler: a scheduled announcement shows up
in the feed when its window opens, but nothing is pushed at that moment.

Out of reach answers 404, as everywhere; readable but not yours to manage
answers 403. Announcements are not notifications: a system announcement does
not write one row per user across every company. Who has read what lives in
`announcement_reads`.

### Absences

Vacation, sick days and other leave. A person asks, a company admin decides, and
an approved absence shows up on the [calendar](#calendar) so everyone knows who
is away.

| Endpoint | Who |
| --- | --- |
| `POST /absences` | any active account - always for themselves |
| `GET /absences/mine` | any active account - its own requests, in any status; takes `?status=` |
| `GET /absences` | `system_admin`, `company_admin` - the requests to decide. Own company; a `system_admin` sees every company or the one in `?companyId=`. Takes `?userId=` and `?status=` |
| `GET /absences/{id}` | the person, or whoever manages that company's absences |
| `POST /absences/{id}/approve` | a `system_admin`, or a `company_admin` of that company - **never on its own request** |
| `POST /absences/{id}/reject` | the same; optional `{ reason }` |
| `POST /absences/{id}/cancel` | the person, or the same deciders; optional `{ reason }` |
| `GET /users/{id}/absence-summary` | the person, or whoever manages that company's absences; takes `?year=` |

**Requests.** A request is `{ type, startDate, endDate, note? }`, where `type` is
`vacation`, `sick` or `leave`. It covers whole days, and `endDate` is
inclusive, so one day has `startDate = endDate`. It spans at most 366 days. It is
born `pending`, and the company's active `company_admin`s are notified.

- Vacation cannot start in the past. A sick day or leave can, because it is
  often registered afterwards.
- A range with no working day (only weekend and holidays) answers 400.
- A range that touches another `pending` or `approved` request of the same
  person answers 409. Rejected and cancelled ones do not count.
- There is no `PATCH`: cancel it and ask again.

Every request comes back with `workingDays`: the weekdays in the range that are
not a national or company holiday. It is worked out on every read, so adding a
company holiday changes it at once for every request that covers that day.

**Deciding.** Only a `pending` request is approved or rejected; anything else
answers 409. Nobody decides their own request: a `company_admin`'s request is
decided by another `company_admin` of the same company, or by a `system_admin`.
An employee trying to decide a colleague's request gets 404, and anyone trying
to decide their own gets 403. `decidedBy`, `decidedAt` and `decisionNote` record
the last decision - approved, rejected or cancelled.

**Cancelling.** The person cancels a `pending` request, or an `approved` one
that has not started yet. A decider cancels a `pending` or `approved` one at any
time, for someone who came back early or a mistake. Anything else answers 409.

**Privacy.** A sick day is health data. Only the person and whoever manages the
company's absences (a `system_admin`, or a `company_admin` of that company) see
the real `type` and the `note`. Everyone else sees vacation as `vacation`, and
sick days and leave only as `absent`. A colleague asking for someone else's
request gets 404, and a colleague asking for someone's summary gets 403.

**Summary.** `GET /users/{id}/absence-summary?year=2026` adds up the working days
of the approved absences in that year, by type: `{ userId, year, vacation, sick,
leave }`. A request across New Year counts only the days in that year. There is
no yearly allowance yet: this is a count, not a balance.

### Calendar

| Endpoint | Who | What |
| --- | --- | --- |
| `GET /calendar?from=&to=` | any active account | own company; a `system_admin` passes `?companyId=` |
| `GET /projects/{id}/calendar?from=&to=` | any active account | own company - the project's people only |
| `GET /holidays?year=` | any active account | own company; a `system_admin` passes `?companyId=`. `year` defaults to this year |
| `POST /holidays` | `system_admin` (naming `companyId`), `company_admin` | own company |
| `DELETE /holidays/{id}` | the same | own company |

A calendar answers `{ companyId, from, to, holidays, absences }` for a range of
at most 366 days, both ends included.

- `holidays` lists the national ones and the company's own, by date. Each one
  has a `kind` (`national` or `company`) and an `id`, which only company
  holidays have.
- `absences` lists the ones that touch the range, as `{ id, userId, type,
  status, startDate, endDate }`. There is never a note, and `type` is masked as
  described in [Absences](#absences). Everyone sees `approved` ones. A person
  also sees their own `pending` ones, and the admins see every `pending` one.
  Terminated accounts are left out. Names are not included: the client resolves
  `userId` against `GET /users`.

The project calendar keeps only the absences of people allocated to the project
on at least one day of the range, plus the project's manager.

**Holidays.** National holidays are not stored. They are worked out from the
company's `country`, and only Portugal (`PT`) is known: the thirteen mandatory
days of the Código do Trabalho, with Good Friday, Easter and Corpus Christi
worked out from Easter each year. Everything else is a company holiday added by
an admin, such as the municipal holiday, Carnival or a closure on the 24th. A
company in another country has only its own. Adding a date that is already a
national holiday, or that the company already has, answers 409.

### Notifications

A personal inbox. Every notification is **a row first**: it is stored whether or
not the person is online, and the live stream only carries the ones created
while they are connected. Someone who was offline reads what they missed through
the REST endpoints when they come back.

| Endpoint | What it is |
| --- | --- |
| `GET /notifications/mine` | newest first, in pages: `?limit=` (1-100, default 20), `?before=` with the previous page's `nextBefore`, `?unread=true` |
| `GET /notifications/mine/unread-count` | `{ unread }`, for the bell |
| `POST /notifications/{id}/read` | marks one read; someone else's answers 404 |
| `POST /notifications/mine/read-all` | marks all read; returns `{ updated }` |
| `POST /notifications/stream-ticket` | a single-use ticket for the stream, valid for 30 seconds |
| `GET /notifications/stream` | the live stream (Server-Sent Events) |

Each one carries a `type`, its `data` (ids, plus names as they were at the time)
and a ready-to-show Portuguese `message`. The types today:

| Type | Who gets it | When |
| --- | --- | --- |
| `allocation.created` | the person | allocated to a project |
| `allocation.updated` | the person | percent, role or end date changed |
| `allocation.ended` | the person | the allocation was closed |
| `project.manager_assigned` | the new manager | a project is created with, or changed to, a manager |
| `project.status_changed` | the people involved and the manager | the project's status changes |
| `review_cycle.opened` | every reviewer, once | a cycle opens |
| `review_cycle.closed` | the reviewers whose requests expired | a cycle closes |
| `review_request.created` | the reviewer | an ad-hoc request is made |
| `review_request.declined` | whoever requested it | an ad-hoc request is declined |
| `review.submitted` | whoever requested it | an ad-hoc review is submitted |
| `user.activated` | the company's active `company_admin`s | an invite is accepted |
| `absence.requested` | the company's active `company_admin`s | someone asks for an absence |
| `absence.approved` | the person | their request is approved |
| `absence.rejected` | the person | their request is rejected; carries the `reason` |
| `absence.cancelled` | the person if an admin cancelled it, or the company's active `company_admin`s if the person did | a request is cancelled |
| `absence.teammate_away` | managers of the projects where the person is allocated on those days | an absence is approved. `type` is masked to `vacation` or `absent` |

Whoever performed the action is never notified of it.

**Adding a type** takes two steps: an entry in
`src/services/notification-catalog.ts` (the schema of its `data`, and its
message), and a `notifier.notify(...)` call where the thing happens, after the
write succeeds and before the response. `notify` drops nulls, duplicates and
excluded ids, validates `data` against the catalog, stores the rows and pushes
them. Like the mailer, it never fails the request: a failure is only logged.

**The stream.** The browser's `EventSource` cannot send an `Authorization`
header, and a JWT in the URL would end up in logs and stay valid for hours. So
the client trades its token for a ticket and opens the stream with that:

```js
async function connect() {
  const { data } = await api.post("/notifications/stream-ticket"); // with the Bearer
  const es = new EventSource(`${API}/notifications/stream?ticket=${data.ticket}`);

  es.addEventListener("ready", () => syncInbox());   // GET /notifications/mine
  es.addEventListener("notification", (e) => addToBell(JSON.parse(e.data)));
  es.addEventListener("announcement", (e) => updateBanners(JSON.parse(e.data)));
  es.addEventListener("close", (e) => {
    es.close();
    if (JSON.parse(e.data).reason === "server_shutdown") setTimeout(connect, 3000);
  });
  es.onerror = () => { es.close(); setTimeout(connect, 3000); };
}
```

| Event | Data |
| --- | --- |
| `ready` | `{ unread }`: connected. Re-sync the inbox over REST |
| `notification` | one notification, shaped like the REST ones |
| `announcement` | `{ action: "created" \| "updated", announcement }`, or `{ action: "deleted", id }` |
| `close` | `{ reason }`, right before the server ends the stream |

The `close` reasons are `token_expired` (the JWT behind the ticket ran out: log
in again), `account_inactive` (suspended or terminated), `server_shutdown`
(reconnect shortly) and `too_many_connections` (more than five streams open for
one person: the oldest is closed, and reconnecting it would only knock out
another tab).

A ticket works once, so the browser's own auto-reconnect would replay a spent
ticket and get a 401: the client reconnects itself, with a fresh ticket. A
fetch-based client may send the Bearer header on the stream instead. The request
log masks `ticket=` in the URLs it prints.

**Limits.** Open streams and tickets live in the server's memory, so this works
with **one** API process; several would need a shared channel such as Postgres
`LISTEN/NOTIFY`. Over HTTP/1.1, each tab's stream takes one of the browser's
six or so connections to the API.

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

## Production

One server, four containers: `db`, `migrate` (runs the migrations and exits),
`api`, and `web` (Caddy: HTTPS, the built frontend, and `/api` proxied to the
API). Both repositories must be cloned side by side:

```
/srv/erp/Back-End
/srv/erp/Front-End
```

### First deploy

On a fresh Ubuntu server with ports 22, 80 and 443 open:

```bash
curl -fsSL https://get.docker.com | sh
```

```bash
mkdir -p /srv/erp && cd /srv/erp && git clone https://github.com/tiagomsilva432/Back-End.git && git clone https://github.com/tiagomsilva432/Front-End.git
```

```bash
cd /srv/erp/Back-End && cp deploy/env.prod.example .env.prod
```

Fill in `.env.prod`. `PUBLIC_URL` is the public address with the protocol; with
no domain, use the server IP through sslip.io, e.g. `https://203-0-113-10.sslip.io`.

```bash
sh deploy/up.sh
```

Create the first `system_admin`:

```bash
docker compose --env-file .env.prod -f compose.prod.yaml exec -e ADMIN_PASSWORD='<password>' api npm run admin:create:prod -- --email=<email>
```

Schedule the daily backup (`crontab -e`):

```
0 3 * * * /bin/sh /srv/erp/Back-End/deploy/backup.sh
```

### Updates

```bash
sh deploy/update.sh
```

### Logs

```bash
docker compose --env-file .env.prod -f compose.prod.yaml logs -f api
```

### Testing locally

The same stack runs on a development machine with `PUBLIC_URL=http://localhost`,
`HTTP_PORT=8080` and `FRONTEND_DIR` pointing at the Front-End checkout. Open
http://localhost:8080.

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
- The realtime hub is spied on, not stubbed, in `tests/helpers/realtime-spy.ts`:
  the spies call through, so a test can open a real stream and still assert on
  what was pushed. The `afterEach` closes every stream and clears the tickets.
- Controllers `await` `notifier.notify(...)` before answering, so a test can read
  the notification rows right after the request returns.

Every test runs inside a transaction that is rolled back, so no test can see
another's writes and no cleanup code is needed. `jest.config.mjs` documents the
setup in full.
