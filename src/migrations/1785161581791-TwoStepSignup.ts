import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Signup collapses from three steps to two: an admin creates the account with
 * the employee's work email, the employee follows an emailed link and sets a
 * password, and the account becomes active. The profile is filled in later and
 * only decides where the user lands after logging in.
 *
 * The invitations table is dropped: its token moves onto users as a single-use
 * signup_token, and temp_email / temp_password_hash have no role in this flow.
 */
export class TwoStepSignup1785161581791 implements MigrationInterface {
    name = 'TwoStepSignup1785161581791'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "signup_token" uuid`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "uq_users_signup_token" UNIQUE ("signup_token")`);
        await queryRunner.query(`ALTER TABLE "users" ADD "signup_token_expires_at" TIMESTAMP WITH TIME ZONE`);

        // Not emitted by migration:generate - TypeORM leaves tables alone once
        // no entity maps to them, so the drop has to be explicit.
        await queryRunner.query(`ALTER TABLE "invitations" DROP CONSTRAINT "FK_a6307ec3927a53c6eeeeff7cccc"`);
        await queryRunner.query(`ALTER TABLE "invitations" DROP CONSTRAINT "FK_e686620e08c4661e70a6b39b94a"`);
        await queryRunner.query(`ALTER TABLE "invitations" DROP CONSTRAINT "FK_53407578b13649da4cac07455ad"`);
        await queryRunner.query(`DROP INDEX "public"."idx_invitations_status"`);
        await queryRunner.query(`DROP TABLE "invitations"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "invitations" ("id" BIGSERIAL NOT NULL, "company_id" bigint NOT NULL, "invited_by_user_id" bigint NOT NULL, "invitee_user_id" bigint, "temp_email" character varying(255) NOT NULL, "temp_password_hash" character varying(255) NOT NULL, "token" uuid NOT NULL DEFAULT gen_random_uuid(), "intended_role" character varying(20) NOT NULL DEFAULT 'employee', "status" character varying(20) NOT NULL DEFAULT 'pending', "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() + INTERVAL '7 days', "accepted_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_invitations_token" UNIQUE ("token"), CONSTRAINT "PK_5dec98cfdfd562e4ad3648bbb07" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_invitations_status" ON "invitations" ("company_id", "status")`);
        await queryRunner.query(`ALTER TABLE "invitations" ADD CONSTRAINT "FK_53407578b13649da4cac07455ad" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invitations" ADD CONSTRAINT "FK_e686620e08c4661e70a6b39b94a" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invitations" ADD CONSTRAINT "FK_a6307ec3927a53c6eeeeff7cccc" FOREIGN KEY ("invitee_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);

        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "signup_token_expires_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "uq_users_signup_token"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "signup_token"`);
    }

}
