import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Avisos (sistema, empresa e projeto), quem já os leu, e as notificações de
 * cada pessoa. Os nomes das FKs são os que o TypeORM gera: o db:check compara-os
 * pelo nome.
 */
export class AddAnnouncementsAndNotifications1788856300000 implements MigrationInterface {
    name = 'AddAnnouncementsAndNotifications1788856300000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "announcements" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "scope" character varying(20) NOT NULL,
                "company_id" uuid,
                "project_id" uuid,
                "created_by" uuid NOT NULL,
                "title" character varying(150) NOT NULL,
                "body" text NOT NULL,
                "severity" character varying(20) NOT NULL DEFAULT 'info',
                "pinned" boolean NOT NULL DEFAULT false,
                "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "ends_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "ck_announcements_window" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at"),
                CONSTRAINT "ck_announcements_scope" CHECK (("scope" = 'system' AND "company_id" IS NULL AND "project_id" IS NULL) OR ("scope" = 'company' AND "company_id" IS NOT NULL AND "project_id" IS NULL) OR ("scope" = 'project' AND "company_id" IS NOT NULL AND "project_id" IS NOT NULL)),
                CONSTRAINT "PK_b3ad760876ff2e19d58e05dc8b0" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_announcements_company" ON "announcements" ("company_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_announcements_project" ON "announcements" ("project_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "announcement_reads" (
                "announcement_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "read_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_633528237d6cee4418942ade0c6" PRIMARY KEY ("announcement_id", "user_id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "notifications" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "recipient_id" uuid NOT NULL,
                "company_id" uuid NOT NULL,
                "type" character varying(50) NOT NULL,
                "data" jsonb NOT NULL,
                "read_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_notifications_recipient" ON "notifications" ("recipient_id", "id")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_notifications_unread" ON "notifications" ("recipient_id") WHERE "read_at" IS NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "announcements" ADD CONSTRAINT "FK_8a27e4e76f87cbe147590bce316" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "announcements" ADD CONSTRAINT "FK_675dab62a5ca8a9af488bf80458" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "announcements" ADD CONSTRAINT "FK_40bd4946a00669c5fb7e6d972f0" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "announcement_reads" ADD CONSTRAINT "FK_5c268ef658d17b1b8304459d655" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "announcement_reads" ADD CONSTRAINT "FK_a70de57e88ed6bc0b8600a75f2c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "notifications" ADD CONSTRAINT "FK_5332a4daa46fd3f4e6625dd275d" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "notifications" ADD CONSTRAINT "FK_c642fb845de2edcae46635863ab" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "notifications" DROP CONSTRAINT "FK_c642fb845de2edcae46635863ab"
        `);
        await queryRunner.query(`
            ALTER TABLE "notifications" DROP CONSTRAINT "FK_5332a4daa46fd3f4e6625dd275d"
        `);
        await queryRunner.query(`
            ALTER TABLE "announcement_reads" DROP CONSTRAINT "FK_a70de57e88ed6bc0b8600a75f2c"
        `);
        await queryRunner.query(`
            ALTER TABLE "announcement_reads" DROP CONSTRAINT "FK_5c268ef658d17b1b8304459d655"
        `);
        await queryRunner.query(`
            ALTER TABLE "announcements" DROP CONSTRAINT "FK_40bd4946a00669c5fb7e6d972f0"
        `);
        await queryRunner.query(`
            ALTER TABLE "announcements" DROP CONSTRAINT "FK_675dab62a5ca8a9af488bf80458"
        `);
        await queryRunner.query(`
            ALTER TABLE "announcements" DROP CONSTRAINT "FK_8a27e4e76f87cbe147590bce316"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_notifications_unread"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_notifications_recipient"
        `);
        await queryRunner.query(`
            DROP TABLE "notifications"
        `);
        await queryRunner.query(`
            DROP TABLE "announcement_reads"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_announcements_project"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_announcements_company"
        `);
        await queryRunner.query(`
            DROP TABLE "announcements"
        `);
    }

}
