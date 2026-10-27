import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * O quadro de cada projeto: as tarefas, com a coluna (status) e a posição
 * dentro dela, e os comentários de cada uma. Os anexos ficam na tabela files.
 * As etiquetas são um array: não há tabela de etiquetas. Os nomes das FKs são
 * os que o TypeORM gera: o db:check compara-os pelo nome.
 */
export class AddProjectTasks1788856800000 implements MigrationInterface {
    name = 'AddProjectTasks1788856800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "project_tasks" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "project_id" uuid NOT NULL,
                "title" character varying(150) NOT NULL,
                "description" text,
                "status" character varying(20) NOT NULL,
                "position" integer NOT NULL,
                "assignee_id" uuid,
                "due_date" date,
                "priority" character varying(20) NOT NULL DEFAULT 'medium',
                "labels" character varying(30) array NOT NULL DEFAULT '{}',
                "created_by" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "completed_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_b1b6204912a6f44133df3a4518b" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_project_tasks_board" ON "project_tasks" ("project_id", "status", "position")
        `);
        await queryRunner.query(`
            CREATE TABLE "project_task_comments" (
                "id" uuid NOT NULL DEFAULT uuidv7(),
                "task_id" uuid NOT NULL,
                "author_id" uuid NOT NULL,
                "body" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "edited_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_277d322a3ce8a000af39a14bb06" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_project_task_comments_task" ON "project_task_comments" ("task_id", "id")
        `);
        await queryRunner.query(`
            ALTER TABLE "project_tasks" ADD CONSTRAINT "FK_68b008b46d5c9f1b49ae92b6f15" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "project_tasks" ADD CONSTRAINT "FK_89de1a5c0f26c99ddf839cc9fa3" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "project_tasks" ADD CONSTRAINT "FK_dc9efb15b07ff6199e629ad4f5a" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "project_task_comments" ADD CONSTRAINT "FK_5a2809b89cc7bb55ae98b5a1986" FOREIGN KEY ("task_id") REFERENCES "project_tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "project_task_comments" ADD CONSTRAINT "FK_523b40f9e82a3281ea48a48a062" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "project_task_comments" DROP CONSTRAINT "FK_523b40f9e82a3281ea48a48a062"
        `);
        await queryRunner.query(`
            ALTER TABLE "project_task_comments" DROP CONSTRAINT "FK_5a2809b89cc7bb55ae98b5a1986"
        `);
        await queryRunner.query(`
            ALTER TABLE "project_tasks" DROP CONSTRAINT "FK_dc9efb15b07ff6199e629ad4f5a"
        `);
        await queryRunner.query(`
            ALTER TABLE "project_tasks" DROP CONSTRAINT "FK_89de1a5c0f26c99ddf839cc9fa3"
        `);
        await queryRunner.query(`
            ALTER TABLE "project_tasks" DROP CONSTRAINT "FK_68b008b46d5c9f1b49ae92b6f15"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_task_comments_task"
        `);
        await queryRunner.query(`
            DROP TABLE "project_task_comments"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."idx_project_tasks_board"
        `);
        await queryRunner.query(`
            DROP TABLE "project_tasks"
        `);
    }

}
