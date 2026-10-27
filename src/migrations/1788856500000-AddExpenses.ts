import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Despesas: de um projeto, ou da própria empresa quando o project_id é null.
 * Os salários não entram aqui: o painel de finanças soma-os à parte. Os nomes
 * das FKs são os que o TypeORM gera: o db:check compara-os pelo nome.
 */
export class AddExpenses1788856500000 implements MigrationInterface {
    name = 'AddExpenses1788856500000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "expenses" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "company_id" uuid NOT NULL,
                "project_id" uuid,
                "title" character varying(150) NOT NULL,
                "description" text,
                "amount" numeric(12,2) NOT NULL,
                "category" character varying(20) NOT NULL,
                "incurred_on" date NOT NULL,
                "created_by" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "ck_expenses_amount_positive" CHECK ("amount" > 0),
                CONSTRAINT "PK_94c3ceb17e3140abc9282c20610" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_expenses_project" ON "expenses" ("project_id", "incurred_on")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_expenses_company" ON "expenses" ("company_id", "incurred_on")
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses" ADD CONSTRAINT "FK_85389c627f20798554ac2bfb052" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses" ADD CONSTRAINT "FK_25ecf373a719f0bc472480ce27a" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses" ADD CONSTRAINT "FK_7c0c012c2f8e6578277c239ee61" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "expenses" DROP CONSTRAINT "FK_7c0c012c2f8e6578277c239ee61"
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses" DROP CONSTRAINT "FK_25ecf373a719f0bc472480ce27a"
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses" DROP CONSTRAINT "FK_85389c627f20798554ac2bfb052"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_expenses_company"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_expenses_project"
        `);
        await queryRunner.query(`
            DROP TABLE "expenses"
        `);
    }

}
