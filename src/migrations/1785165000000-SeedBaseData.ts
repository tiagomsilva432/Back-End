import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The first company and the shared skills catalog, matching the seed block in
 * db/reference/erp_schema.sql. Kept as a migration so a fresh database - a new
 * Docker volume, for instance - is usable without any manual setup step.
 *
 * Users are deliberately not seeded: the first admin is created by hand.
 */
export class SeedBaseData1785165000000 implements MigrationInterface {
    name = 'SeedBaseData1785165000000'

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
