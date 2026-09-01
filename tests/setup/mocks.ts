import { beforeEach, jest } from "@jest/globals";
import type { ObjectLiteral, Repository } from "typeorm";
import { AppDataSource } from "../../src/data-source.js";
import { fakeRepo, resetFakeRepo } from "../helpers/fake-db.js";
import { logSpy } from "../helpers/console-spy.js";

/**
 * A COSTURA — o ponto único onde a base de dados real é substituída pela falsa.
 *
 * Porque é que uma só linha chega para toda a aplicação:
 * todos os 11 ficheiros em src/repositories/ (e também o src/routes/health-routes.ts)
 * fazem `AppDataSource.getRepository(X)` NO TOPO DO MÓDULO, ou seja, no momento
 * em que são importados pela primeira vez. Se trocarmos o método getRepository
 * ANTES de o src/app.ts ser importado, todos eles recebem o fakeRepo.
 *
 * E é isso que a configuração garante: o Jest corre os ficheiros de setup até
 * ao fim ANTES de importar o ficheiro de teste. Por isso os testes podem fazer
 * um `import { app } from "../src/app.js"` normalíssimo, sem truques.
 *
 * O cast é preciso porque o fakeRepo só implementa os meia-dúzia de métodos que
 * a aplicação usa, e não a interface Repository completa do TypeORM.
 */
jest
  .spyOn(AppDataSource, "getRepository")
  .mockReturnValue(fakeRepo as unknown as Repository<ObjectLiteral>);

/**
 * Isolamento entre testes: nenhum teste pode herdar o que outro configurou.
 * Este beforeEach é global — corre antes de CADA teste de CADA ficheiro.
 */
beforeEach(() => {
  resetFakeRepo();
  logSpy.mockClear();
});
