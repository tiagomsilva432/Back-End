# Back-End

ERP backend for a software company: users, projects, allocations, salaries,
skills and peer salary reviews.

Express 5 + TypeORM + PostgreSQL, written in TypeScript (ESM).

> **Status: no HTTP endpoints yet.** The server boots and connects to the
> database, but every request currently returns `404`. The data layer is done
> and migrated; routes, auth and validation are the next milestone. This README
> is here so you can get the project running and know what shapes to expect.

---

## Requirements

- **Node.js 20+** (developed on 24)
- **PostgreSQL 13+** (developed on 18)

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
| `DB_HOST` / `DB_PORT` | `localhost` / `5432` | |
| `DB_USER` / `DB_PASSWORD` | `postgres` / `postgres` | |
| `DB_NAME` | `erp` | the example file uses `erp_ossilvas_dev` |
| `DB_LOGGING` | `false` | set `true` to log every SQL statement |
| `JWT_SECRET` | - | not used yet, needed once auth lands |

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

You should see `Base de dados ligada` followed by the server URL. If the
database is unreachable the process exits instead of starting.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | watch mode via tsx, no build step |
| `npm run build` | compile TypeScript to `dist/` |
| `npm start` | run the compiled build (**run `build` first** - there is no prestart hook) |
| `npm run db:migrate` | apply pending migrations |
| `npm run db:revert` | roll back the most recent migration |
| `npm run db:generate -- src/migrations/SomeName` | diff entities against the DB and write a migration |

`db:generate` produces a **proposal**, not a finished migration. Read it before
running it: it does not drop tables whose entity was deleted, and it does not
always honour constraint names declared on the entity.

## Data model

11 tables. `companies` is the tenant root; everything hangs off it directly or
through `users`.

| Table | Purpose |
| --- | --- |
| `companies` | tenant root (one seeded company for now) |
| `users` | login identity, role and account status |
| `employee_profiles` | personal details, keyed by `user_id` |
| `salaries` | full salary history; current row has `effective_to IS NULL` |
| `projects` | client work, with an optional manager |
| `allocations` | which user works on which project, at what percent |
| `skills` / `employee_skills` | shared skill catalog and per-employee proficiency |
| `review_cycles` | a company-wide review round |
| `review_requests` | one reviewer reviewing one reviewee |
| `reviews` | the submitted answer to a request |

There is no "teams" table on purpose: who works with whom is derived from
overlapping allocations on the same project.

The original hand-written SQL lives in `db/reference/erp_schema.sql` for
historical context. **It is not the source of truth** - the entities in
`src/entities/` are, and the database is built from migrations.

## Signup is two steps

1. An admin creates the account with the employee's **work email** - the address
   provisioned on the company domain, e.g. `tiago.m.silva@company1.com`. That is
   the login identity. The user row is created with `status: "invited"`,
   `password_hash: null`, and a single-use `signup_token` plus expiry. The link
   is sent to a personal address the admin supplies, which is never stored.
2. The employee follows the link and sets a password. The token is cleared,
   `password_hash` is set, and `status` becomes `"active"`.

Because each company owns its email domain, a work address belongs to exactly
one tenant. Look a user up by email, read `company_id` off the row, and scope
everything after that to it.

The employee profile is filled in **after** that and is optional at login time -
whether it exists only decides where the frontend sends the user next (profile
form vs. main page).

| State | `status` | `password_hash` | `signup_token` |
| --- | --- | --- | --- |
| account created | `invited` | `null` | set |
| signup complete | `active` | set | `null` |

## Conventions worth knowing before you consume the API

These affect the JSON you will receive, and some of them are deliberate choices
that look surprising at first:

- **Ids are numbers.** They are `BIGSERIAL` in Postgres, which the driver would
  normally hand back as strings; they are converted so `id === id` comparisons
  behave.
- **Money is a string.** `salaries.amount` and `projects.budget` come back as
  `"1234.56"`, not `1234.56`. Parsing them into a JS number loses cents - format
  for display, or use a decimal library for arithmetic.
- **Plain dates are strings.** `hire_date`, `start_date`, `effective_from` and
  similar are `"YYYY-MM-DD"`, not timestamps. Do not run them through `new Date()`
  unless you want timezone shifts.
- **Timestamps are ISO 8601** with timezone (`created_at`, `deleted_at`, ...).
- **Enum-ish fields are plain strings**, validated in the backend rather than by
  the database. The accepted values live in `src/types/enums.ts`:
  - `role`: `admin` | `employee`
  - `status` (user): `invited` | `active` | `suspended` | `terminated`
  - `status` (project): `planned` | `active` | `on_hold` | `completed` | `cancelled`
  - `status` (review request): `pending` | `submitted` | `declined` | `expired`
  - `category` (skill): `language` | `framework` | `role` | `tool` | `soft_skill` | `other`
- **Users are soft-deleted.** A deleted user still exists with `deleted_at` set
  and will not appear in normal listings.
