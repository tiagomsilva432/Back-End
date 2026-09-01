/**
 * FICHEIRO 1 de 5 — o básico do Jest + Supertest.
 *
 * Ensina: describe / it / expect, async-await nos testes, request(app),
 * a diferença entre toBe e toEqual, e o envelope de resposta da tua API.
 *
 * Nota: este ficheiro não configura nenhum mock. Nenhuma destas rotas chega a
 * tocar na base de dados.
 */

import { describe, it, expect } from "@jest/globals";
import request from "supertest";
import { app } from "../src/app.js";

/**
 * A IDEIA CENTRAL, antes de olhares para os testes:
 *
 * `request(app)` recebe o objeto Express exportado pelo src/app.ts, levanta-o
 * numa porta efémera durante o tempo de UM pedido, e desliga-o a seguir.
 * O teu `app.listen()` nunca é chamado, nenhuma porta fica ocupada, e podes
 * correr os testes com a app "a sério" a correr ao lado sem conflito nenhum.
 *
 * É por isso que ter o src/app.ts (que exporta o app) separado do src/server.ts
 * (que faz o listen) importa tanto. E é por isso que os testes NUNCA devem
 * importar o src/server.ts: esse tem `await AppDataSource.initialize()` no topo,
 * que tentaria mesmo ligar-se ao Postgres e faria process.exit(1) ao falhar,
 * matando o processo do Jest com uma mensagem confusíssima.
 */

// describe() é só uma gaveta: agrupa testes relacionados e o nome aparece no
// output. Podes aninhá-los à vontade.
describe("GET /health", () => {
  // it() (ou test(), é o mesmo) é um teste. A função é async porque o pedido
  // HTTP é assíncrono — sem o await, o teste acabava antes da resposta chegar
  // e passava sempre.
  it("responde 200 com o envelope padrão", async () => {
    const res = await request(app).get("/health");

    // toBe usa Object.is — serve para primitivos (números, strings, booleanos).
    expect(res.status).toBe(200);

    // toEqual compara objetos em profundidade, campo a campo.
    // Se usasses toBe aqui, falhava sempre: são dois objetos diferentes na
    // memória, mesmo tendo o mesmo conteúdo.
    expect(res.body).toEqual({
      status: 200,
      message: "Ligação com a API OK",
      code: "SUCCESS_OK", // veio de getDefaults(200), a rota não passou code
    });

    // REPARA no que NÃO está aí: não há campo `data`.
    // O HttpResponse põe sempre `data: this.data`, mas aqui vale undefined, e o
    // JSON.stringify apaga chaves com valor undefined. O toEqual também ignora
    // chaves undefined — já o toStrictEqual não ignoraria. Experimenta trocar!
  });
});

describe("rotas inexistentes", () => {
  it("devolve o 404 do catch-all", async () => {
    const res = await request(app).get("/rota-que-nao-existe");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      status: 404,
      // Aqui NENHUM argumento foi passado ao HttpResponse além do 404, por isso
      // tanto a mensagem como o código vêm inteiros do getDefaults(404).
      message: "Não encontrado",
      code: "NOT_FOUND",
    });
  });

  it("também apanha o método errado numa rota que existe", async () => {
    // O /health existe, mas só para GET. Como nenhum router responde a um PUT,
    // o pedido cai no mesmo catch-all.
    const res = await request(app).put("/health");

    expect(res.status).toBe(404);
  });
});

describe("GET /health/db", () => {
  it("devolve 503 porque a DataSource nunca é inicializada nos testes", async () => {
    const res = await request(app).get("/health/db");

    // Este teste documenta uma verdade importante sobre a nossa montagem:
    // trocámos o getRepository por um falso, mas NUNCA chamámos
    // AppDataSource.initialize(). Logo isInitialized é false, e a rota
    // devolve 503 mesmo antes de tentar consultar o repositório.
    // (Fazer isto dar 200 é um dos exercícios no fim.)
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 503,
      message: "Data Source não inicializada",
      code: "SERVICE_UNAVAILABLE",
    });
  });
});
