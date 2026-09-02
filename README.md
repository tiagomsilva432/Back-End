# Back-End

ERP backend for a software company: users, projects, allocations, salaries,
skills and peer salary reviews.

Express 5 + TypeORM + PostgreSQL, written in TypeScript (ESM).

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

---

## Tests

```bash
npm test
```

That is the whole command. There is no database to create, no container to
start, no port to configure - **Docker just has to be running.**

| Script | What it does |
| --- | --- |
| `npm test` | the full suite against a real PostgreSQL |
| `npm run test:watch` | the same, re-running on save |
| `npm run test:types` | type-check `src/` and `tests/` (the SWC transform does not) |

### How it works

Every test runs against a genuine `postgres:18-alpine`, started by
[Testcontainers](https://testcontainers.com) and thrown away at the end. It is
published on a random free port, so it never collides with the `docker compose`
database you develop against, and it can never touch your real data.

| File | Role |
| --- | --- |
| `tests/setup/global-db.mjs` | runs **once per run**, before the workers exist: starts the container, applies the migrations with `npm run db:migrate`, and publishes the connection details through `process.env` |
| `tests/setup/global-db-teardown.mjs` | stops the container after the last test |
| `tests/setup/env.ts` | runs **once per test file**, before any application module: fixes `NODE_ENV`, `JWT_SECRET`, bcrypt rounds, and so on |
| `tests/setup/db.ts` | runs once per test file, after the framework is up: connects, and wraps every test in a transaction |
| `tests/helpers/factories.ts` | shortcuts for putting real rows in the database |

`jest.config.mjs` explains the ordering of those hooks in detail; it is worth
reading once, because two of them run in a different process from the tests.

### Isolation

Each test runs inside a transaction that is **rolled back, never committed**. No
test can see another's writes, no cleanup code is needed, and the data seeded by
the `SeedBaseData` migration survives for everyone. This is also why
`maxWorkers` is 1: parallel workers would share one database and see each
other's uncommitted rows.

The seam that makes this work is a single line in `tests/setup/db.ts`, which
swaps `AppDataSource.getRepository` for one bound to the current transaction.
Every repository in `src/repositories/` calls `getRepository` at module load, so
replacing it once redirects the whole application.

To write SQL against the test's own transaction, use the `sql` helper from
`tests/setup/db.ts`. Do **not** use `AppDataSource.query()`: it takes a separate
connection from the pool and cannot see what the test just wrote.

### Cost

Starting the container and migrating takes a few seconds before the first test;
the tests themselves then run in a couple of seconds. The very first run on a
machine also pulls the Postgres image.

If the run is killed halfway, the container is not orphaned: Testcontainers
starts a companion "Ryuk" container whose only job is to remove everything the
session created once that session disappears.
