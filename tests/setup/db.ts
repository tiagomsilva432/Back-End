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

export function sql<T = unknown>(query: string, params?: unknown[]): Promise<T> {
    return queryRunner.query(query, params) as Promise<T>;
}

export function manager() {
    return queryRunner.manager;
}
