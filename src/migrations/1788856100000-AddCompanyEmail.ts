import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Nullable: as empresas que já existem não têm email e não há valor sensato
 * para lhes inventar. O mailer recorre ao MAIL_FROM quando a coluna está vazia.
 */
export class AddCompanyEmail1788856100000 implements MigrationInterface {
    name = 'AddCompanyEmail1788856100000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "companies" ADD "email" character varying(255)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "companies" DROP COLUMN "email"
        `);
    }

}
