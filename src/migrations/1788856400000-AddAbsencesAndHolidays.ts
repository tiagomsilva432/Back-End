import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Pedidos de ausência (férias, baixa, outras faltas) e os feriados próprios de
 * cada empresa. Os nacionais não se gravam: calculam-se a partir do país. Os
 * nomes das FKs são os que o TypeORM gera: o db:check compara-os pelo nome.
 */
export class AddAbsencesAndHolidays1788856400000 implements MigrationInterface {
    name = 'AddAbsencesAndHolidays1788856400000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "absence_requests" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "company_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "type" character varying(20) NOT NULL,
                "status" character varying(20) NOT NULL DEFAULT 'pending',
                "start_date" date NOT NULL,
                "end_date" date NOT NULL,
                "note" text,
                "decided_by" uuid,
                "decided_at" TIMESTAMP WITH TIME ZONE,
                "decision_note" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "ck_absence_requests_dates_valid" CHECK ("end_date" >= "start_date"),
                CONSTRAINT "PK_e988f5c02848634791e3869c9a7" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_absence_requests_company" ON "absence_requests" ("company_id", "status")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_absence_requests_user" ON "absence_requests" ("user_id", "start_date")
        `);
        await queryRunner.query(`
            CREATE TABLE "company_holidays" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "company_id" uuid NOT NULL,
                "date" date NOT NULL,
                "name" character varying(150) NOT NULL,
                "created_by" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "uq_company_holidays_company_date" UNIQUE ("company_id", "date"),
                CONSTRAINT "PK_50b57407aa7dd6a4659a3c697fa" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "absence_requests" ADD CONSTRAINT "FK_974926a2f6f623ea759d8aeeb99" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "absence_requests" ADD CONSTRAINT "FK_d7703ff0558df3ad55ff9d56ca9" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "absence_requests" ADD CONSTRAINT "FK_5a07afe867de1f5e1437ec9edb4" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "company_holidays" ADD CONSTRAINT "FK_a1506ed1671230b7611d46e8bfd" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "company_holidays" ADD CONSTRAINT "FK_a4b518ea6272990a07fd57b3a2e" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "company_holidays" DROP CONSTRAINT "FK_a4b518ea6272990a07fd57b3a2e"
        `);
        await queryRunner.query(`
            ALTER TABLE "company_holidays" DROP CONSTRAINT "FK_a1506ed1671230b7611d46e8bfd"
        `);
        await queryRunner.query(`
            ALTER TABLE "absence_requests" DROP CONSTRAINT "FK_5a07afe867de1f5e1437ec9edb4"
        `);
        await queryRunner.query(`
            ALTER TABLE "absence_requests" DROP CONSTRAINT "FK_d7703ff0558df3ad55ff9d56ca9"
        `);
        await queryRunner.query(`
            ALTER TABLE "absence_requests" DROP CONSTRAINT "FK_974926a2f6f623ea759d8aeeb99"
        `);
        await queryRunner.query(`
            DROP TABLE "company_holidays"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_absence_requests_user"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_absence_requests_company"
        `);
        await queryRunner.query(`
            DROP TABLE "absence_requests"
        `);
    }

}
