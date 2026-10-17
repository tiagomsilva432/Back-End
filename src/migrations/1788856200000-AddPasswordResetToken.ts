import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Colunas próprias para o reset de password, e não as do convite: assim um
 * token de reset nunca serve para ativar uma conta, e pode ter validade curta.
 */
export class AddPasswordResetToken1788856200000 implements MigrationInterface {
    name = 'AddPasswordResetToken1788856200000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users" ADD "password_reset_token" uuid
        `);
        await queryRunner.query(`
            ALTER TABLE "users" ADD "password_reset_expires_at" TIMESTAMP WITH TIME ZONE
        `);
        await queryRunner.query(`
            ALTER TABLE "users" ADD CONSTRAINT "uq_users_password_reset_token" UNIQUE ("password_reset_token")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users" DROP CONSTRAINT "uq_users_password_reset_token"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "password_reset_expires_at"
        `);
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN "password_reset_token"
        `);
    }

}
