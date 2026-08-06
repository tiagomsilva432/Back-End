/**
 * FICHEIRO 2 de 5 — o caminho feliz (201) e, sobretudo, MOCKS.
 *
 * Ensina: preparar o valor de retorno de um mock (mockResolvedValue), a
 * estrutura Arrange / Act / Assert, e a lição mais importante de todas —
 * fazer asserções não só sobre a RESPOSTA, mas sobre o que a aplicação PEDIU
 * à base de dados.
 */

import { describe, it, expect } from "@jest/globals";
import request from "supertest";
import { app } from "../src/app.js";
import { fakeRepo } from "./helpers/fake-db.js";
import { logSpy } from "./helpers/console-spy.js";

/**
 * O utilizador que a "base de dados" vai fingir ter gravado.
 * Repara que é um objeto literal simples — não precisa de ser um User a sério.
 * O controller só faz `created.signupToken` e devolve o objeto no `data`.
 */
const utilizadorGravado = {
  id: 1,
  companyId: 7,
  email: "ana@empresa.pt",
  role: "employee",
  status: "invited",
  signupToken: "11111111-1111-4111-8111-111111111111",
  signupTokenExpiresAt: "2026-08-07T00:00:00.000Z",
};

describe("POST /auth/account/create", () => {
  it("cria a conta e devolve 201", async () => {
    // ---------- ARRANGE (preparar) ----------
    // "Quando perguntarem se este email já existe, responde que não."
    fakeRepo.findOneBy.mockResolvedValue(null);
    // "Quando mandarem gravar, devolve este utilizador."
    // mockResolvedValue = a função devolve uma Promise resolvida com este valor,
    // que é exatamente o que um `await repo.save(...)` espera.
    fakeRepo.save.mockResolvedValue(utilizadorGravado);

    // ---------- ACT (agir) ----------
    // Repara no email: com espaços à volta e com maiúsculas, de propósito.
    const res = await request(app)
      .post("/auth/account/create")
      .send({ company_id: 7, email: "  ANA@Empresa.pt  ", role: "employee" });

    // ---------- ASSERT (verificar) ----------

    // 1) A resposta HTTP
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      status: 201,
      message: "Conta criada", // passada explicitamente pelo controller
      code: "SUCCESS_CREATED", // esta veio do getDefaults(201)
      data: utilizadorGravado,
    });

    // 2) O QUE A APLICAÇÃO PEDIU À BASE DE DADOS.
    // Isto é o que distingue um teste a sério de um teste superficial: não
    // basta a resposta estar certa, a app tem de ter feito as perguntas certas.
    expect(fakeRepo.findOneBy).toHaveBeenCalledTimes(1);
    expect(fakeRepo.findOneBy).toHaveBeenCalledWith({
      // O email chegou aqui SEM espaços e em minúsculas. Não fomos nós que
      // limpámos — foi o Zod, no validateBody, que faz .trim().toLowerCase()
      // e depois reescreve o req.body. Este teste prova essa transformação.
      email: "ana@empresa.pt",
      companyId: 7,
    });

    // toHaveBeenCalledWith exige que os argumentos batam certo na íntegra.
    // Como a entidade User tem dezenas de campos, usamos expect.objectContaining:
    // "tem de conter pelo menos isto, o resto não me interessa".
    expect(fakeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 7,
        email: "ana@empresa.pt",
        role: "employee",
        // expect.any(String) = "qualquer string serve". Perfeito para um UUID
        // gerado aleatoriamente, que nunca poderíamos prever.
        signupToken: expect.any(String),
      }),
    );

    // 3) O log do URL de ativação.
    // Como silenciámos o console.log com um spy, podemos verificá-lo.
    // Isto prova, de caminho, que o BASE_URL e o PORT do tests/setup/env.ts
    // chegaram mesmo ao controller.
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `http://localhost:3000/auth/account/activate?token=${utilizadorGravado.signupToken}`,
      ),
    );

    // 4) A data de expiração é uma data VÁLIDA.
    // Porquê um teste só para isto? Porque `expect.any(Date)` passaria mesmo
    // com uma "Invalid Date" — que é exatamente o que acontece se a variável
    // SIGNUP_TOKEN_EXPIRATION_DAYS não estiver definida (Number(undefined) é
    // NaN, e new Date(NaN) é Invalid Date). Fixámo-la no tests/setup/env.ts;
    // esta asserção é o que garante que continua fixada.
    //
    // O `!` no fim existe por causa do "noUncheckedIndexedAccess": true do teu
    // tsconfig — para o TypeScript, calls[0] pode ser undefined.
    const [entidadeGravada] = fakeRepo.save.mock.calls[0]!;
    const expira = (entidadeGravada as { signupTokenExpiresAt: Date }).signupTokenExpiresAt;
    expect(Number.isNaN(expira.getTime())).toBe(false);
  });
});
