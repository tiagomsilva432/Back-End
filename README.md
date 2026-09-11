# Back-End

ERP backend for a software company: users, projects, allocations, salaries,
skills and peer salary reviews.

Express 5 + TypeORM + PostgreSQL, written in TypeScript (ESM).

---

## Requirements

- **Node.js 20+** (developed on 24)
- **PostgreSQL 13+** (developed on 18)
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
| `DB_HOST` / `DB_PORT` | `localhost` / `5432` | |
| `DB_USER` / `DB_PASSWORD` | `postgres` / `postgres` | |
| `DB_NAME` | `erp` | the example file uses `erp_ossilvas_dev` |
| `DB_LOGGING` | `false` | set `true` to log every SQL statement |
| `JWT_SECRET` | - | required |
| `SMTP_HOST` | - | **empty = emails go to the console instead of being sent** |
| `SMTP_PORT` | `587` | `465` switches to implicit TLS |
| `SMTP_USER` / `SMTP_PASSWORD` | - | omit both for a server that needs no auth |
| `MAIL_FROM` | `nao-responder@localhost` | the sender address; must be one your SMTP provider authorises |
| `MAIL_ALLOW_COMPANY_FROM` | `false` | `true` sends from `companies.email` — see below |

### Sending real emails

The activation link is emailed on account creation (employees only — both admin
roles are created without a signup token, so there is nothing to activate).

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

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | watch mode via tsx, no build step |
| `npm run build` | compile TypeScript to `dist/` |
| `npm start` | build, then run the compiled output |
| `npm run lint` | Biome |
| `npm run lint:fix` | Biome, writing the fixes |
| `npm run db:migrate` | apply pending migrations |
| `npm run db:revert` | roll back the most recent migration |
| `npm run db:generate -- src/migrations/SomeName` | diff entities against the DB and write a migration |
| `npm run db:check` | fail if the entities and the migrations disagree |

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

Every test runs inside a transaction that is rolled back, so no test can see
another's writes and no cleanup code is needed. `jest.config.mjs` documents the
setup in full.
