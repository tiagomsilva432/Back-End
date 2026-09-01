/**
 * FICHEIRO 3 de 5 — o 409 (conta duplicada) e o ISOLAMENTO entre testes.
 *
 * Ensina: mudar o valor de retorno de um mock consoante o teste,
 * not.toHaveBeenCalled(), e porque é que limpar os mocks é obrigatório.
 */

import { describe, it, expect } from "@jest/globals";
import request from "supertest";
import { app } from "../src/app.js";
import { fakeRepo } from "./helpers/fake-db.js";

describe("POST /auth/account/create — conta já existente", () => {
  it("devolve 409 quando já existe conta com esse email na empresa", async () => {
    // A ÚNICA diferença para o teste do 201 é esta linha: agora o findOneBy
    // encontra alguém. O mesmo mock, outro valor, outro caminho no controller.
    fakeRepo.findOneBy.mockResolvedValue({
      id: 99,
      email: "ana@empresa.pt",
      companyId: 7,
    });

    const res = await request(app)
      .post("/auth/account/create")
      .send({ company_id: 7, email: "ana@empresa.pt" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      status: 409,
      message: "Não foi possível criar a conta.", // mensagem explícita do controller
      code: "CONFLICT", // default do getDefaults(409)
    });

    // A ASSERÇÃO MAIS IMPORTANTE DESTE FICHEIRO.
    // Verificar que a resposta é 409 não chega: se o controller respondesse 409
    // MAS gravasse na mesma, o teste acima passaria à mesma. Isto é que prova
    // que nada foi escrito.
    //
    // (Repara também que a resposta não traz `data`: o HttpError foi criado sem
    // `details`, por isso o errorHandler não tem nada para anexar.)
    expect(fakeRepo.save).not.toHaveBeenCalled();
  });

  /**
   * Este segundo teste existe só para te mostrar o isolamento a funcionar.
   *
   * O teste anterior deixou o findOneBy configurado para devolver um
   * utilizador. Se essa configuração persistisse, este teste receberia 409 em
   * vez de 201 — e ias perder uma tarde a perceber porquê.
   *
   * O beforeEach global em tests/setup/mocks.ts chama resetFakeRepo() antes de
   * CADA teste. Os três níveis de limpeza, para gravares:
   *   mockClear()   -> esquece as chamadas registadas
   *   mockReset()   -> esquece as chamadas E o valor de retorno  <-- usamos este
   *   mockRestore() -> desfaz um spyOn, repondo a função original
   */
  it("começa com os mocks limpos, sem herdar nada do teste anterior", async () => {
    // Prova de que o beforeEach correu: nenhuma chamada registada até agora.
    expect(fakeRepo.findOneBy).not.toHaveBeenCalled();

    fakeRepo.findOneBy.mockResolvedValue(null);
    fakeRepo.save.mockResolvedValue({ id: 2, email: "bruno@empresa.pt" });

    const res = await request(app)
      .post("/auth/account/create")
      .send({ company_id: 7, email: "bruno@empresa.pt" });

    expect(res.status).toBe(201);
  });
});
