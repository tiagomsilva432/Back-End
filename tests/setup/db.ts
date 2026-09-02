import { afterAll, afterEach, beforeAll, beforeEach, jest } from "@jest/globals";
import type { EntityTarget, ObjectLiteral, QueryRunner, Repository } from "typeorm";
import { AppDataSource } from "../../src/data-source.js";
import { logSpy } from "../helpers/console-spy.js";

let queryRunner: QueryRunner;

function lazyRepo(entity: EntityTarget<ObjectLiteral>): Repository<ObjectLiteral> {
    return new Proxy({} as Repository<ObjectLiteral>, {
        get(_target, prop) {
            const repo = queryRunner.manager.getRepository(entity);
            const value = Reflect.get(repo, prop) as unknown;
            return typeof value === "function" ? value.bind(repo) : value;
        },
    });
}

jest
    .spyOn(AppDataSource, "getRepository")
    .mockImplementation(lazyRepo as unknown as typeof AppDataSource.getRepository);
beforeAll(async () => {
    AppDataSource.setOptions({ migrations: [] });
    await AppDataSource.initialize();
});

afterAll(async () => {
    await AppDataSource.destroy();
});

beforeEach(async () => {
    queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    logSpy.mockClear();
});

afterEach(async () => {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
});

/** Repositório ligado à transação do teste. O caminho normal. */
export function repo<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> {
    return queryRunner.manager.getRepository(entity);
}

export function manager() {
    return queryRunner.manager;
}

/**
 * SQL em cru, dentro da transação. Só para verificar o que o TypeORM esconde:
 * nomes de colunas, tabelas sem entidade. Para tudo o resto usa-se o repo().
 */
export function sql<T = unknown>(query: string, params?: unknown[]): Promise<T> {
    return queryRunner.query(query, params) as Promise<T>;
}
