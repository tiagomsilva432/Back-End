import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Ficheiros: avatares, recibos das despesas e documentos das ausências, numa
 * tabela só. O dono é polimórfico (o `kind` diz o que é o owner_id), por isso
 * não tem FK; a empresa e quem enviou têm. Os bytes ficam no disco.
 *
 * O avatar_url sai do perfil: o avatar passa a ser um ficheiro. Os links que lá
 * estivessem perdem-se, e o `down` só devolve a coluna, vazia. Os nomes das
 * FKs são os que o TypeORM gera: o db:check compara-os pelo nome.
 */
export class AddFiles1788856600000 implements MigrationInterface {
    name = 'AddFiles1788856600000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "files" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "company_id" uuid NOT NULL,
                "kind" character varying(20) NOT NULL,
                "owner_id" uuid NOT NULL,
                "original_name" character varying(255) NOT NULL,
                "mime_type" character varying(50) NOT NULL,
                "size_bytes" integer NOT NULL,
                "sha256" character(64) NOT NULL,
                "storage_key" text NOT NULL,
                "uploaded_by" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_6c16b9093a142e0e7613b04a3d9" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_files_hash" ON "files" ("company_id", "kind", "sha256")
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_files_owner" ON "files" ("kind", "owner_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "employee_profiles" DROP COLUMN "avatar_url"
        `);
        await queryRunner.query(`
            ALTER TABLE "files" ADD CONSTRAINT "FK_c00637e6c7bc8a791e0e72d6d9c" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "files" ADD CONSTRAINT "FK_63c92c51cd7fd95c2d79d709b61" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "files" DROP CONSTRAINT "FK_63c92c51cd7fd95c2d79d709b61"
        `);
        await queryRunner.query(`
            ALTER TABLE "files" DROP CONSTRAINT "FK_c00637e6c7bc8a791e0e72d6d9c"
        `);
        await queryRunner.query(`
            ALTER TABLE "employee_profiles" ADD "avatar_url" text
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_files_owner"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_files_hash"
        `);
        await queryRunner.query(`
            DROP TABLE "files"
        `);
    }

}
