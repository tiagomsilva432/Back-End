import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * O papel "admin" passou a "system_admin" e nasceu o "company_admin".
 *
 * users.role é um VARCHAR sem constraint, por isso isto é só uma migração de
 * dados: não há tipo ENUM nem CHECK para alterar. O default da coluna continua
 * a ser 'employee'.
 *
 * O down não sabe o que fazer aos 'company_admin' - não existiam antes desta
 * migração e não têm equivalente no vocabulário antigo -, por isso deixa-os
 * como estão em vez de os despromover a 'employee' e perder informação.
 */
export class RenameAdminRole1788856000000 implements MigrationInterface {
    name = 'RenameAdminRole1788856000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "users" SET "role" = 'system_admin' WHERE "role" = 'admin'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "users" SET "role" = 'admin' WHERE "role" = 'system_admin'
        `);
    }

}
