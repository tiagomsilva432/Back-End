import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Os recursos de um projeto (links, notas e um ficheiro, que fica na tabela
 * files) e o chat do projeto, com a marca de até onde cada pessoa leu. A marca
 * não tem FK para a mensagem: apagar essa mensagem não pode levar a marca. Os
 * nomes das FKs são os que o TypeORM gera: o db:check compara-os pelo nome.
 */
export class AddProjectResourcesAndMessages1788856700000 implements MigrationInterface {
    name = 'AddProjectResourcesAndMessages1788856700000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "project_resources" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "project_id" uuid NOT NULL,
                "title" character varying(150) NOT NULL,
                "url" character varying(2048),
                "note" text,
                "created_by" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_eb70b404ac252d33a6aec260608" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_project_resources_project" ON "project_resources" ("project_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "project_messages" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "project_id" uuid NOT NULL,
                "author_id" uuid NOT NULL,
                "body" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "edited_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_b1f2a06218031572ae003b431cc" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_project_messages_project" ON "project_messages" ("project_id", "id")
        `);
        await queryRunner.query(`
            CREATE TABLE "project_message_reads" (
                "project_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "last_read_message_id" uuid NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_664b03f5f7a24ea1f7b7225808b" PRIMARY KEY ("project_id", "user_id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "project_resources" ADD CONSTRAINT "FK_bb9d79fee7bd355580742bc1b99" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "project_resources" ADD CONSTRAINT "FK_93875567defd5e2c425d9a98c5e" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "project_messages" ADD CONSTRAINT "FK_6fb7fe0c99c46ee6326fe363b2c" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "project_messages" ADD CONSTRAINT "FK_4110d381820963d019767deacbe" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "project_message_reads" ADD CONSTRAINT "FK_2f67ff8124b1f0ce67601ac2605" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "project_message_reads" ADD CONSTRAINT "FK_741c37535e427db1e6b2da84c24" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "project_message_reads" DROP CONSTRAINT "FK_741c37535e427db1e6b2da84c24"
        `);
        await queryRunner.query(`
            ALTER TABLE "project_message_reads" DROP CONSTRAINT "FK_2f67ff8124b1f0ce67601ac2605"
        `);
        await queryRunner.query(`
            ALTER TABLE "project_messages" DROP CONSTRAINT "FK_4110d381820963d019767deacbe"
        `);
        await queryRunner.query(`
            ALTER TABLE "project_messages" DROP CONSTRAINT "FK_6fb7fe0c99c46ee6326fe363b2c"
        `);
        await queryRunner.query(`
            ALTER TABLE "project_resources" DROP CONSTRAINT "FK_93875567defd5e2c425d9a98c5e"
        `);
        await queryRunner.query(`
            ALTER TABLE "project_resources" DROP CONSTRAINT "FK_bb9d79fee7bd355580742bc1b99"
        `);
        await queryRunner.query(`
            DROP TABLE "project_message_reads"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_messages_project"
        `);
        await queryRunner.query(`
            DROP TABLE "project_messages"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_resources_project"
        `);
        await queryRunner.query(`
            DROP TABLE "project_resources"
        `);
    }

}
