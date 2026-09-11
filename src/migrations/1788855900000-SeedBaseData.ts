import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * A primeira empresa e o catálogo de competências partilhado. Fica como
 * migração para que uma base de dados vazia - um volume Docker novo, por
 * exemplo - arranque utilizável sem nenhum passo manual.
 *
 * Os ids não são indicados: o default uuidv7() da coluna trata disso.
 * Utilizadores não são semeados de propósito; o primeiro administrador é
 * criado à mão.
 */
export class SeedBaseData1788855900000 implements MigrationInterface {
    name = 'SeedBaseData1788855900000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            INSERT INTO "companies" ("name", "country")
            SELECT 'My Software Company', 'PT'
            WHERE NOT EXISTS (SELECT 1 FROM "companies")
        `);

        await queryRunner.query(`
            INSERT INTO "skills" ("name", "category") VALUES
                ('Backend', 'role'), ('Frontend', 'role'), ('Fullstack', 'role'),
                ('DevOps', 'role'), ('QA', 'role'),
                ('Python', 'language'), ('JavaScript', 'language'),
                ('TypeScript', 'language'), ('Java', 'language'),
                ('C#', 'language'), ('Go', 'language'), ('SQL', 'language'),
                ('React', 'framework'), ('Angular', 'framework'),
                ('Vue', 'framework'), ('Node.js', 'framework'),
                ('Spring', 'framework'), ('.NET', 'framework'),
                ('Docker', 'tool'), ('Git', 'tool')
            ON CONFLICT ("name") DO NOTHING
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DELETE FROM "skills" WHERE "name" IN (
                'Backend','Frontend','Fullstack','DevOps','QA',
                'Python','JavaScript','TypeScript','Java','C#','Go','SQL',
                'React','Angular','Vue','Node.js','Spring','.NET','Docker','Git'
            )
        `);
        await queryRunner.query(`DELETE FROM "companies" WHERE "name" = 'My Software Company'`);
    }

}
