-- ============================================================
-- ERP Database Schema (PostgreSQL)
-- Software company ERP: users, projects, allocations,
-- salaries, skills, invitations (2-step sign-in), peer salary reviews
-- ============================================================
 
-- ------------------------------------------------------------
-- ENUM types
-- ------------------------------------------------------------
CREATE TYPE user_role        AS ENUM ('admin', 'employee');
CREATE TYPE user_status      AS ENUM ('invited', 'active', 'suspended', 'terminated');
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
CREATE TYPE project_status   AS ENUM ('planned', 'active', 'on_hold', 'completed', 'cancelled');
CREATE TYPE skill_category   AS ENUM ('language', 'framework', 'role', 'tool', 'soft_skill', 'other');
CREATE TYPE review_request_status AS ENUM ('pending', 'submitted', 'declined', 'expired');
 
-- ------------------------------------------------------------
-- 1. Companies (dynamic: supports 1 now, N later)
-- ------------------------------------------------------------
CREATE TABLE companies (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    tax_id      VARCHAR(50) UNIQUE,
    country     VARCHAR(2)  DEFAULT 'PT',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
 
-- ------------------------------------------------------------
-- 2. Users (authentication + role separation)
-- ------------------------------------------------------------
CREATE TABLE users (
    id                   BIGSERIAL PRIMARY KEY,
    company_id           BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email                VARCHAR(255) NOT NULL,              -- final/personal login email
    password_hash        VARCHAR(255),                       -- NULL until first sign-in completed
    role                 user_role   NOT NULL DEFAULT 'employee',
    status               user_status NOT NULL DEFAULT 'invited',
    must_change_password BOOLEAN     NOT NULL DEFAULT TRUE, -- forces password reset after temp login
    email_verified_at    TIMESTAMPTZ,
    last_login_at        TIMESTAMPTZ,
    deleted_at           TIMESTAMPTZ,                        -- soft delete: PII anonymized in backend
                                                            -- (email -> deleted-{id}@anonymized.local)
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, email)                              -- scoped per company (tenant isolation)
);
 
CREATE INDEX idx_users_company ON users(company_id);
 
-- ------------------------------------------------------------
-- 3. Invitations (2-step sign-in)
--    Step 1: an admin/employee creates the invitation with a
--            temporary email + temporary password.
--    Step 2: invitee logs in with temp credentials via the
--            emailed link (token), then sets real email/password.
-- ------------------------------------------------------------
CREATE TABLE invitations (
    id                  BIGSERIAL PRIMARY KEY,
    company_id          BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    invited_by_user_id  BIGINT NOT NULL REFERENCES users(id),
    invitee_user_id     BIGINT REFERENCES users(id),        -- filled once the user row is created
    temp_email          VARCHAR(255) NOT NULL,              -- temporary company email for first sign-in
    temp_password_hash  VARCHAR(255) NOT NULL,
    token               UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE, -- link sent in the email
    intended_role       user_role NOT NULL DEFAULT 'employee',
    status              invitation_status NOT NULL DEFAULT 'pending',
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
    accepted_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
 
CREATE INDEX idx_invitations_status ON invitations(company_id, status);
 
-- ------------------------------------------------------------
-- 4. Employee profiles (personal information)
-- ------------------------------------------------------------
CREATE TABLE employee_profiles (
    user_id      BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    first_name   VARCHAR(100) NOT NULL,
    last_name    VARCHAR(100) NOT NULL,
    phone        VARCHAR(30),
    address      TEXT,
    birth_date   DATE,
    hire_date    DATE NOT NULL,
    job_title    VARCHAR(100),               -- e.g. "Backend Developer"
    avatar_url   TEXT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
 
-- ------------------------------------------------------------
-- 5. Salaries (full history; current salary = row where effective_to IS NULL)
-- ------------------------------------------------------------
CREATE TABLE salaries (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    currency        VARCHAR(3) NOT NULL DEFAULT 'EUR',
    effective_from  DATE NOT NULL,
    effective_to    DATE,                    -- NULL = current salary
    reason          VARCHAR(255),            -- e.g. "annual raise", "peer review outcome"
    created_by      BIGINT NOT NULL REFERENCES users(id),  -- the admin who set it
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);
 
-- only one open (current) salary per user
CREATE UNIQUE INDEX uq_salary_current ON salaries(user_id) WHERE effective_to IS NULL;
 
-- ------------------------------------------------------------
-- 6. Projects
-- ------------------------------------------------------------
-- No "teams" layer: the working group IS the project workforce,
-- derived from allocations. Coworkers = overlapping allocations
-- on the same project (see project_coworkers view at the bottom).
CREATE TABLE projects (
    id          BIGSERIAL PRIMARY KEY,
    company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    manager_id  BIGINT REFERENCES users(id) ON DELETE SET NULL, -- project manager / lead
    name        VARCHAR(150) NOT NULL,
    client_name VARCHAR(150),
    status      project_status NOT NULL DEFAULT 'planned',
    start_date  DATE,
    end_date    DATE,
    budget      NUMERIC(14,2),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, name),
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
 
-- ------------------------------------------------------------
-- 8. Allocations (who works on what, at what %)
-- ------------------------------------------------------------
CREATE TABLE allocations (
    id                 BIGSERIAL PRIMARY KEY,
    user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id         BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    allocation_percent SMALLINT NOT NULL CHECK (allocation_percent BETWEEN 1 AND 100),
    role_on_project    VARCHAR(100),        -- e.g. "BE dev", "Tech lead"
    start_date         DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date           DATE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date IS NULL OR end_date >= start_date)
);
 
CREATE INDEX idx_allocations_user    ON allocations(user_id);
CREATE INDEX idx_allocations_project ON allocations(project_id);
 
-- ------------------------------------------------------------
-- 9. Skills catalog + employee skills
-- ------------------------------------------------------------
CREATE TABLE skills (
    id        BIGSERIAL PRIMARY KEY,
    name      VARCHAR(100) NOT NULL UNIQUE,   -- "Python", "React", "Backend", "Frontend"
    category  skill_category NOT NULL DEFAULT 'other'
);
 
CREATE TABLE employee_skills (
    user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_id         BIGINT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    proficiency      SMALLINT CHECK (proficiency BETWEEN 1 AND 5),
    years_experience NUMERIC(4,1) CHECK (years_experience >= 0),
    PRIMARY KEY (user_id, skill_id)
);
 
-- ------------------------------------------------------------
-- 10. Peer salary reviews
--     Two entry points, one data model:
--     * Ad-hoc: admin requests reviews for one employee (cycle_id NULL)
--     * Cycle:  admin opens a company-wide cycle ("Q3 2026 review");
--       backend creates one request per (reviewer, reviewee) pair,
--       reviewers auto-populated from project_coworkers.
--     Company metrics aggregate over cycles only (cycle_id IS NOT NULL).
-- ------------------------------------------------------------
CREATE TABLE review_cycles (
    id         BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,          -- e.g. 'Q3 2026 Performance Review'
    opened_by  BIGINT NOT NULL REFERENCES users(id),
    deadline   DATE,
    closed_at  TIMESTAMPTZ,                    -- NULL = still running
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, name)
);
 
CREATE TABLE review_requests (
    id            BIGSERIAL PRIMARY KEY,
    company_id    BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    cycle_id      BIGINT REFERENCES review_cycles(id) ON DELETE CASCADE, -- NULL = ad-hoc
    requested_by  BIGINT NOT NULL REFERENCES users(id),   -- admin who launched it
    reviewer_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewee_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        review_request_status NOT NULL DEFAULT 'pending',
    due_date      DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (reviewer_id <> reviewee_id)
);
 
-- one review per pair per cycle (ad-hoc duplicates allowed over time)
CREATE UNIQUE INDEX uq_request_pair_per_cycle
    ON review_requests(cycle_id, reviewer_id, reviewee_id)
    WHERE cycle_id IS NOT NULL;
 
CREATE TABLE reviews (
    id                BIGSERIAL PRIMARY KEY,
    request_id        BIGINT NOT NULL UNIQUE REFERENCES review_requests(id) ON DELETE CASCADE,
    recommends_raise  BOOLEAN NOT NULL,                    -- "deserves a raise or not"
    performance_score SMALLINT CHECK (performance_score BETWEEN 1 AND 5),
    comments          TEXT,
    submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
 
CREATE INDEX idx_review_requests_reviewer ON review_requests(reviewer_id, status);
CREATE INDEX idx_review_requests_reviewee ON review_requests(reviewee_id);
 
-- ------------------------------------------------------------
-- Seed data: first company + skills catalog
-- ------------------------------------------------------------
INSERT INTO companies (name) VALUES ('My Software Company');
 
INSERT INTO skills (name, category) VALUES
    ('Backend',    'role'),
    ('Frontend',   'role'),
    ('Fullstack',  'role'),
    ('DevOps',     'role'),
    ('QA',         'role'),
    ('Python',     'language'),
    ('JavaScript', 'language'),
    ('TypeScript', 'language'),
    ('Java',       'language'),
    ('C#',         'language'),
    ('Go',         'language'),
    ('SQL',        'language'),
    ('React',      'framework'),
    ('Angular',    'framework'),
    ('Vue',        'framework'),
    ('Node.js',    'framework'),
    ('Spring',     'framework'),
    ('.NET',       'framework'),
    ('Docker',     'tool'),
    ('Git',        'tool');
 
-- ------------------------------------------------------------
-- Useful views
-- ------------------------------------------------------------
 
-- Current salary per employee
CREATE VIEW v_current_salaries AS
SELECT u.id AS user_id, p.first_name, p.last_name, s.amount, s.currency, s.effective_from
FROM users u
JOIN employee_profiles p ON p.user_id = u.id
JOIN salaries s ON s.user_id = u.id AND s.effective_to IS NULL;
 
-- Total active allocation % per employee (spot over-allocation > 100%)
CREATE VIEW v_user_allocation_load AS
SELECT user_id, SUM(allocation_percent) AS total_percent
FROM allocations
WHERE end_date IS NULL OR end_date >= CURRENT_DATE
GROUP BY user_id;
 
-- Raise-review summary per employee
CREATE VIEW v_raise_review_summary AS
SELECT rr.reviewee_id,
       COUNT(*) FILTER (WHERE r.recommends_raise)     AS votes_for_raise,
       COUNT(*) FILTER (WHERE NOT r.recommends_raise) AS votes_against,
       ROUND(AVG(r.performance_score), 2)             AS avg_score
FROM review_requests rr
JOIN reviews r ON r.request_id = rr.id
GROUP BY rr.reviewee_id;
 
-- ---------- CONVENIENCE VIEW: project coworkers ----------
-- People who share (or shared) a project with a given user, with
-- overlapping allocation periods. This is the reviewer pool for
-- peer salary reviews: recent collaborators, regardless of "team".
CREATE VIEW project_coworkers AS
SELECT DISTINCT
    a1.user_id                AS user_id,
    a2.user_id                AS coworker_id,
    a1.project_id             AS project_id,
    GREATEST(a1.start_date, a2.start_date) AS worked_together_from,
    LEAST(COALESCE(a1.end_date, 'infinity'::date),
          COALESCE(a2.end_date, 'infinity'::date)) AS worked_together_to
FROM allocations a1
JOIN allocations a2
  ON a1.project_id = a2.project_id
 AND a1.user_id <> a2.user_id
 AND a1.start_date <= COALESCE(a2.end_date, 'infinity'::date)
 AND a2.start_date <= COALESCE(a1.end_date, 'infinity'::date);
 