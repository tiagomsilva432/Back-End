/**
 * FICHEIRO 5 de 5 — o 500 (erro inesperado).
 *
 * Ensina: mockRejectedValue (simular uma falha), silenciar o console.error
 * LOCALMENTE para depois lhe fazer asserções, e mockRestore().
 */

import { describe, it, expect, jest } from "@jest/globals";
import request from "supertest";
import { app } from "../src/app.js";
import { fakeRepo } from "./helpers/fake-db.js";

describe("POST /auth/account/create — falhas inesperadas", () => {
  it("devolve 500 quando a base de dados rebenta", async () => {
    // Silenciamos o console.error aqui dentro, e não no setup global, por duas
    // razões: assim podemos verificá-lo, e um erro genuíno noutro teste
    // qualquer continua a aparecer no output.
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    fakeRepo.findOneBy.mockResolvedValue(null);
    // mockRejectedValue = a Promise é REJEITADA com este erro.
    // É assim que se simula uma falha de I/O sem ter uma base de dados a sério.
    fakeRepo.save.mockRejectedValue(new Error("ligação perdida"));

    const res = await request(app)
      .post("/auth/account/create")
      .send({ company_id: 1, email: "ana@empresa.pt" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      status: 500,
      message: "Erro interno do servidor",
      code: "INTERNAL_SERVER_ERROR",
      // Como o erro NÃO é um HttpError, o errorHandler cai no ramo genérico e
      // expõe a err.message — outra vez, só porque envIsDev é true.
      data: "ligação perdida",
    });

    // O errorHandler registou o erro. Verificar isto tem valor: um servidor que
    // devolve 500 sem deixar rasto nos logs é impossível de depurar em produção.
    expect(errorSpy).toHaveBeenCalledWith("[Unhandled Error]", expect.any(Error));

    // mockRestore() repõe o console.error verdadeiro. Como este spy foi criado
    // dentro do teste (e não no setup), somos nós os responsáveis por o limpar.
    errorSpy.mockRestore();
  });
});
