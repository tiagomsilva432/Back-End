/**
 * FICHEIRO 4 de 5 — o 400 (validação) e testes em tabela.
 *
 * Ensina: it.each, toMatchObject, expect.arrayContaining / objectContaining,
 * e testar um middleware ATRAVÉS da camada HTTP em vez de o chamar à mão.
 *
 * Nota conceptual: não importamos o validateBody nem o createAccountSchema aqui.
 * Mandamos pedidos HTTP e olhamos para a resposta. É isso um teste funcional —
 * testa o comportamento visível, não a implementação. Se um dia trocares o Zod
 * por outra coisa, estes testes continuam válidos sem uma única alteração.
 */

import { describe, it, expect } from "@jest/globals";
import request from "supertest";
import { app } from "../src/app.js";
import { fakeRepo } from "./helpers/fake-db.js";

/**
 * A tabela de casos. Cada linha vira um teste.
 * Muito melhor do que copiar-colar o mesmo it() seis vezes: acrescentar um caso
 * novo é acrescentar uma linha.
 */
const casosInvalidos = [
  { nome: "email em falta", body: { company_id: 1 }, campo: "email" },
  { nome: "email inválido", body: { company_id: 1, email: "isto-nao-e-email" }, campo: "email" },
  { nome: "company_id em falta", body: { email: "ana@empresa.pt" }, campo: "company_id" },
  { nome: "company_id como texto", body: { company_id: "1", email: "ana@empresa.pt" }, campo: "company_id" },
  { nome: "company_id igual a 0", body: { company_id: 0, email: "ana@empresa.pt" }, campo: "company_id" },
  { nome: "role desconhecido", body: { company_id: 1, email: "ana@empresa.pt", role: "chefe" }, campo: "role" },
];

describe("POST /auth/account/create — validação do corpo", () => {
  // it.each recebe a tabela e corre o teste uma vez por linha.
  // O `$nome` no título é substituído pelo campo `nome` de cada objeto.
  it.each(casosInvalidos)("devolve 400 quando: $nome", async ({ body, campo }) => {
    const res = await request(app).post("/auth/account/create").send(body);

    expect(res.status).toBe(400);

    // toMatchObject: "o objeto tem de conter PELO MENOS estas chaves".
    // Usamos aqui em vez de toEqual porque o `data` é verificado à parte a seguir.
    expect(res.body).toMatchObject({
      status: 400,
      message: "Dados inválidos",
      code: "BAD_REQUEST",
    });

    // ATENÇÃO — porque é que existe um `data` numa resposta de erro:
    // o errorHandler só anexa os details se `envIsDev` for true, e
    // envIsDev = NODE_ENV !== "production". Nos testes NODE_ENV é "test",
    // logo envIsDev é TRUE e os details vêm mesmo. Em produção não viriam.
    expect(res.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: campo, message: expect.any(String) }),
      ]),
    );
    // Traduzindo a asserção: "o array tem de conter, algures, um objeto cujo
    // field seja o esperado e cuja message seja uma string qualquer".
    //
    // REPARA no expect.any(String): NUNCA faças asserções sobre o texto exato
    // da mensagem do Zod ("Invalid email", "Expected number, received string"…).
    // Esses textos mudam entre versões da biblioteca e transformariam a tua
    // suite numa fonte de falsos alarmes. O `field` é estável, a `message` não.

    // E a prova de que o middleware travou mesmo o pedido:
    // o controller nunca correu, por isso ninguém foi à base de dados.
    expect(fakeRepo.findOneBy).not.toHaveBeenCalled();
  });
});
