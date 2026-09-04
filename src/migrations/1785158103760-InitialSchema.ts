import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1785158103760 implements MigrationInterface {
    name = 'InitialSchema1785158103760'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "employee_profiles" ("user_id" bigint NOT NULL, "first_name" character varying(100) NOT NULL, "last_name" character varying(100) NOT NULL, "phone" character varying(30), "address" text, "birth_date" date, "hire_date" date NOT NULL, "job_title" character varying(100), "avatar_url" text, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_986e309c16f09ce6cc47d674cfe" PRIMARY KEY ("user_id"))`);
        await queryRunner.query(`CREATE TABLE "salaries" ("id" BIGSERIAL NOT NULL, "user_id" bigint NOT NULL, "amount" numeric(12,2) NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'EUR', "effective_from" date NOT NULL, "effective_to" date, "reason" character varying(255), "created_by" bigint NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_salaries_period_valid" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from"), CONSTRAINT "ck_salaries_amount_non_negative" CHECK ("amount" >= 0), CONSTRAINT "PK_20ca60aa8d4201c7bcb430fdb36" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_salary_current" ON "salaries" ("user_id") WHERE "effective_to" IS NULL`);
        await queryRunner.query(`CREATE TABLE "projects" ("id" BIGSERIAL NOT NULL, "company_id" bigint NOT NULL, "manager_id" bigint, "name" character varying(150) NOT NULL, "client_name" character varying(150), "status" character varying(20) NOT NULL DEFAULT 'planned', "start_date" date, "end_date" date, "budget" numeric(14,2), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_projects_company_name" UNIQUE ("company_id", "name"), CONSTRAINT "ck_projects_dates_valid" CHECK ("end_date" IS NULL OR "start_date" IS NULL OR "end_date" >= "start_date"), CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "allocations" ("id" BIGSERIAL NOT NULL, "user_id" bigint NOT NULL, "project_id" bigint NOT NULL, "allocation_percent" smallint NOT NULL, "role_on_project" character varying(100), "start_date" date NOT NULL DEFAULT ('now'::text)::date, "end_date" date, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_allocations_dates_valid" CHECK ("end_date" IS NULL OR "end_date" >= "start_date"), CONSTRAINT "ck_allocations_percent_range" CHECK ("allocation_percent" BETWEEN 1 AND 100), CONSTRAINT "PK_ca63099fc248466264af0fa6f1f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_allocation_open_per_project" ON "allocations" ("user_id", "project_id") WHERE "end_date" IS NULL`);
        await queryRunner.query(`CREATE INDEX "idx_allocations_project" ON "allocations" ("project_id") `);
        await queryRunner.query(`CREATE INDEX "idx_allocations_user" ON "allocations" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "skills" ("id" BIGSERIAL NOT NULL, "name" character varying(100) NOT NULL, "category" character varying(20) NOT NULL DEFAULT 'other', CONSTRAINT "uq_skills_name" UNIQUE ("name"), CONSTRAINT "PK_0d3212120f4ecedf90864d7e298" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "employee_skills" ("user_id" bigint NOT NULL, "skill_id" bigint NOT NULL, "proficiency" smallint, "years_experience" numeric(4,1), CONSTRAINT "ck_employee_skills_years_non_negative" CHECK ("years_experience" >= 0), CONSTRAINT "ck_employee_skills_proficiency_range" CHECK ("proficiency" BETWEEN 1 AND 5), CONSTRAINT "PK_899425f40ff845ee1ac9cb6c75e" PRIMARY KEY ("user_id", "skill_id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" BIGSERIAL NOT NULL, "company_id" bigint NOT NULL, "email" character varying(255) NOT NULL, "password_hash" character varying(255), "role" character varying(20) NOT NULL DEFAULT 'employee', "status" character varying(20) NOT NULL DEFAULT 'invited', "must_change_password" boolean NOT NULL DEFAULT true, "email_verified_at" TIMESTAMP WITH TIME ZONE, "last_login_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_users_company_email" UNIQUE ("company_id", "email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "companies" ("id" BIGSERIAL NOT NULL, "name" character varying(150) NOT NULL, "tax_id" character varying(50), "country" character varying(2) NOT NULL DEFAULT 'PT', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_companies_tax_id" UNIQUE ("tax_id"), CONSTRAINT "PK_d4bc3e82a314fa9e29f652c2c22" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "invitations" ("id" BIGSERIAL NOT NULL, "company_id" bigint NOT NULL, "invited_by_user_id" bigint NOT NULL, "invitee_user_id" bigint, "temp_email" character varying(255) NOT NULL, "temp_password_hash" character varying(255) NOT NULL, "token" uuid NOT NULL DEFAULT gen_random_uuid(), "intended_role" character varying(20) NOT NULL DEFAULT 'employee', "status" character varying(20) NOT NULL DEFAULT 'pending', "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() + INTERVAL '7 days', "accepted_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_invitations_token" UNIQUE ("token"), CONSTRAINT "PK_5dec98cfdfd562e4ad3648bbb07" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_invitations_status" ON "invitations" ("company_id", "status") `);
        await queryRunner.query(`CREATE TABLE "reviews" ("id" BIGSERIAL NOT NULL, "request_id" bigint NOT NULL, "recommends_raise" boolean NOT NULL, "performance_score" smallint, "comments" text, "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_6ea6d2328e7d32aa0b0970d8d9" UNIQUE ("request_id"), CONSTRAINT "ck_reviews_score_range" CHECK ("performance_score" BETWEEN 1 AND 5), CONSTRAINT "PK_231ae565c273ee700b283f15c1d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "review_requests" ("id" BIGSERIAL NOT NULL, "company_id" bigint NOT NULL, "cycle_id" bigint, "requested_by" bigint NOT NULL, "reviewer_id" bigint NOT NULL, "reviewee_id" bigint NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'pending', "due_date" date, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_review_requests_distinct_parties" CHECK ("reviewer_id" <> "reviewee_id"), CONSTRAINT "PK_01e5bec2adcef1cf498e861f75a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_review_requests_reviewee" ON "review_requests" ("reviewee_id") `);
        await queryRunner.query(`CREATE INDEX "idx_review_requests_reviewer" ON "review_requests" ("reviewer_id", "status") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_request_pair_per_cycle" ON "review_requests" ("cycle_id", "reviewer_id", "reviewee_id") WHERE "cycle_id" IS NOT NULL`);
        await queryRunner.query(`CREATE TABLE "review_cycles" ("id" BIGSERIAL NOT NULL, "company_id" bigint NOT NULL, "name" character varying(100) NOT NULL, "opened_by" bigint NOT NULL, "deadline" date, "closed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_review_cycles_company_name" UNIQUE ("company_id", "name"), CONSTRAINT "PK_5634972955eaa909a8ff55736a7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" ADD CONSTRAINT "FK_986e309c16f09ce6cc47d674cfe" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "salaries" ADD CONSTRAINT "FK_c12591382bdd41fa79264f339e0" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "salaries" ADD CONSTRAINT "FK_b1d8063ee22651550b8ef3caa13" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "projects" ADD CONSTRAINT "FK_c8708288b8e6a060ed7b9e1a226" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "projects" ADD CONSTRAINT "FK_87bd52575ded2be008b89dd7b21" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "allocations" ADD CONSTRAINT "FK_28409a4ad876dc3ae8ce0a665bd" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "allocations" ADD CONSTRAINT "FK_1e9073e8826a16fd21cbbece599" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_skills" ADD CONSTRAINT "FK_b53752a82507ed7ef787264d38a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_skills" ADD CONSTRAINT "FK_d27f44563392b7a95805bcc5f0e" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_7ae6334059289559722437bcc1c" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invitations" ADD CONSTRAINT "FK_53407578b13649da4cac07455ad" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invitations" ADD CONSTRAINT "FK_e686620e08c4661e70a6b39b94a" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invitations" ADD CONSTRAINT "FK_a6307ec3927a53c6eeeeff7cccc" FOREIGN KEY ("invitee_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD CONSTRAINT "FK_6ea6d2328e7d32aa0b0970d8d96" FOREIGN KEY ("request_id") REFERENCES "review_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "review_requests" ADD CONSTRAINT "FK_813bbe803d633420d605d6eda21" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "review_requests" ADD CONSTRAINT "FK_996d6349ceba28995df384be18f" FOREIGN KEY ("cycle_id") REFERENCES "review_cycles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "review_requests" ADD CONSTRAINT "FK_10d8a94ae158083ea3dfc238c7c" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "review_requests" ADD CONSTRAINT "FK_7e5795fa9e66542b3f43291a2ca" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "review_requests" ADD CONSTRAINT "FK_f204528e70bedf49bc15e8193e2" FOREIGN KEY ("reviewee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "review_cycles" ADD CONSTRAINT "FK_90d84ed3b91f5ac8f582879274c" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "review_cycles" ADD CONSTRAINT "FK_f1034c22510eb5523edb1e32e50" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "review_cycles" DROP CONSTRAINT "FK_f1034c22510eb5523edb1e32e50"`);
        await queryRunner.query(`ALTER TABLE "review_cycles" DROP CONSTRAINT "FK_90d84ed3b91f5ac8f582879274c"`);
        await queryRunner.query(`ALTER TABLE "review_requests" DROP CONSTRAINT "FK_f204528e70bedf49bc15e8193e2"`);
        await queryRunner.query(`ALTER TABLE "review_requests" DROP CONSTRAINT "FK_7e5795fa9e66542b3f43291a2ca"`);
        await queryRunner.query(`ALTER TABLE "review_requests" DROP CONSTRAINT "FK_10d8a94ae158083ea3dfc238c7c"`);
        await queryRunner.query(`ALTER TABLE "review_requests" DROP CONSTRAINT "FK_996d6349ceba28995df384be18f"`);
        await queryRunner.query(`ALTER TABLE "review_requests" DROP CONSTRAINT "FK_813bbe803d633420d605d6eda21"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_6ea6d2328e7d32aa0b0970d8d96"`);
        await queryRunner.query(`ALTER TABLE "invitations" DROP CONSTRAINT "FK_a6307ec3927a53c6eeeeff7cccc"`);
        await queryRunner.query(`ALTER TABLE "invitations" DROP CONSTRAINT "FK_e686620e08c4661e70a6b39b94a"`);
        await queryRunner.query(`ALTER TABLE "invitations" DROP CONSTRAINT "FK_53407578b13649da4cac07455ad"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_7ae6334059289559722437bcc1c"`);
        await queryRunner.query(`ALTER TABLE "employee_skills" DROP CONSTRAINT "FK_d27f44563392b7a95805bcc5f0e"`);
        await queryRunner.query(`ALTER TABLE "employee_skills" DROP CONSTRAINT "FK_b53752a82507ed7ef787264d38a"`);
        await queryRunner.query(`ALTER TABLE "allocations" DROP CONSTRAINT "FK_1e9073e8826a16fd21cbbece599"`);
        await queryRunner.query(`ALTER TABLE "allocations" DROP CONSTRAINT "FK_28409a4ad876dc3ae8ce0a665bd"`);
        await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT "FK_87bd52575ded2be008b89dd7b21"`);
        await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT "FK_c8708288b8e6a060ed7b9e1a226"`);
        await queryRunner.query(`ALTER TABLE "salaries" DROP CONSTRAINT "FK_b1d8063ee22651550b8ef3caa13"`);
        await queryRunner.query(`ALTER TABLE "salaries" DROP CONSTRAINT "FK_c12591382bdd41fa79264f339e0"`);
        await queryRunner.query(`ALTER TABLE "employee_profiles" DROP CONSTRAINT "FK_986e309c16f09ce6cc47d674cfe"`);
        await queryRunner.query(`DROP TABLE "review_cycles"`);
        await queryRunner.query(`DROP INDEX "public"."uq_request_pair_per_cycle"`);
        await queryRunner.query(`DROP INDEX "public"."idx_review_requests_reviewer"`);
        await queryRunner.query(`DROP INDEX "public"."idx_review_requests_reviewee"`);
        await queryRunner.query(`DROP TABLE "review_requests"`);
        await queryRunner.query(`DROP TABLE "reviews"`);
        await queryRunner.query(`DROP INDEX "public"."idx_invitations_status"`);
        await queryRunner.query(`DROP TABLE "invitations"`);
        await queryRunner.query(`DROP TABLE "companies"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "employee_skills"`);
        await queryRunner.query(`DROP TABLE "skills"`);
        await queryRunner.query(`DROP INDEX "public"."idx_allocations_user"`);
        await queryRunner.query(`DROP INDEX "public"."idx_allocations_project"`);
        await queryRunner.query(`DROP INDEX "public"."uq_allocation_open_per_project"`);
        await queryRunner.query(`DROP TABLE "allocations"`);
        await queryRunner.query(`DROP TABLE "projects"`);
        await queryRunner.query(`DROP INDEX "public"."uq_salary_current"`);
        await queryRunner.query(`DROP TABLE "salaries"`);
        await queryRunner.query(`DROP TABLE "employee_profiles"`);
    }

}
