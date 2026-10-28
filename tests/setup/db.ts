import { rm } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, jest } from "@jest/globals";
import type { EntityTarget, ObjectLiteral, QueryRunner, Repository } from "typeorm";
import { AppDataSource } from "../../src/data-source.js";
import { uploadsDir } from "../../src/env-vars.js";
import { realtime } from "../../src/services/realtime.js";
import { streamTickets } from "../../src/services/stream-tickets.js";
import { errorSpy, logSpy } from "../helpers/console-spy.js";
import { resetMailSpies } from "../helpers/mailer-spy.js";
import { resetRealtimeSpies } from "../helpers/realtime-spy.js";

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
    errorSpy.mockClear();
    resetMailSpies();
    resetRealtimeSpies();
});

afterEach(async () => {
    // O hub e os bilhetes vivem em memória: sem isto passavam de um teste para o outro.
    realtime.closeAll();
    streamTickets.clear();
    // O rollback desfaz as linhas dos ficheiros, mas não o que ficou no disco.
    await rm(uploadsDir(), { recursive: true, force: true });
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
