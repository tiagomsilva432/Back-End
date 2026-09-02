import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";
import { UserStatus } from "../../src/types/enums.js";
import { criarUtilizador, criarUtilizadorAtivo } from "../helpers/factories.js";

const PASSWORD = "Password1!";

describe("POST /auth/login", () => {
    it("devolve um token utilizável para uma conta ativa", async () => {
        const utilizador = await criarUtilizadorAtivo(PASSWORD, {
            email: "gabriel@empresa.pt",
        });

        const res = await request(app)
            .post("/auth/login")
            .send({ email: "gabriel@empresa.pt", password: PASSWORD });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            status: 200,
            message: "Login bem sucedido",
            data: {
                user: {
                    id: utilizador.id,
                    email: "gabriel@empresa.pt",
                    role: "employee",
                },
            },
        });

        expect(JSON.stringify(res.body)).not.toContain("$2");

        const claims = jwt.verify(res.body.data.token, process.env.JWT_SECRET!);
        expect(claims).toMatchObject({
            sub: String(utilizador.id),
            companyId: utilizador.companyId,
            role: "employee",
        });
    });

    it("aceita o email com maiúsculas e espaços", async () => {
        await criarUtilizadorAtivo(PASSWORD, { email: "helena@empresa.pt" });

        await request(app)
            .post("/auth/login")
            .send({ email: "  HELENA@Empresa.pt  ", password: PASSWORD })
            .expect(200);
    });

    it("devolve 401, e a mesma resposta, para email inexistente e password errada", async () => {
        await criarUtilizadorAtivo(PASSWORD, { email: "irene@empresa.pt" });

        const emailErrado = await request(app)
            .post("/auth/login")
            .send({ email: "nao-existe@empresa.pt", password: PASSWORD });

        const passwordErrada = await request(app)
            .post("/auth/login")
            .send({ email: "irene@empresa.pt", password: "PasswordErrada1!" });

        expect(emailErrado.status).toBe(401);
        expect(passwordErrada.status).toBe(401);
        expect(emailErrado.body).toEqual(passwordErrada.body);
    });

    it("devolve 401 para uma conta que ainda não definiu password", async () => {
        await criarUtilizador({ email: "joana@empresa.pt" });

        const res = await request(app)
            .post("/auth/login")
            .send({ email: "joana@empresa.pt", password: PASSWORD });

        expect(res.status).toBe(401);
    });

    it.each([
        ["suspensa", { status: UserStatus.Suspended }],
        ["terminada", { status: UserStatus.Terminated }],
        ["com troca de password pendente", { mustChangePassword: true }],
    ])("devolve 403 para uma conta %s", async (_nome, opcoes) => {
        await criarUtilizadorAtivo(PASSWORD, { email: "luis@empresa.pt", ...opcoes });

        const res = await request(app)
            .post("/auth/login")
            .send({ email: "luis@empresa.pt", password: PASSWORD });
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ status: 403, message: "Conta não está ativa" });
    });

    it.each([
        ["email em falta", { password: PASSWORD }, "email"],
        ["email inválido", { email: "sem-arroba", password: PASSWORD }, "email"],
        ["password em falta", { email: "a@b.pt" }, "password"],
        ["password vazia", { email: "a@b.pt", password: "" }, "password"],
    ])("devolve 400 quando: %s", async (_nome, corpo, campoComErro) => {
        const res = await request(app).post("/auth/login").send(corpo);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: campoComErro })]),
        );
    });
});
