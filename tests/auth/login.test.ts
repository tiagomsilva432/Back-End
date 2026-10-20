import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";
import { UserStatus } from "../../src/types/enums.js";
import { criarEmpresa, criarUtilizador } from "../helpers/factories.js";

const PASSWORD = "Password1!";

describe("POST /auth/login", () => {
    it("devolve um token utilizável para uma conta ativa", async () => {
        const utilizador = await criarUtilizador({
            email: "gabriel@empresa.pt",
            password: PASSWORD,
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
        await criarUtilizador({ email: "helena@empresa.pt", password: PASSWORD });

        await request(app)
            .post("/auth/login")
            .send({ email: "  HELENA@Empresa.pt  ", password: PASSWORD })
            .expect(200);
    });

    it("devolve 401, e a mesma resposta, para email inexistente e password errada", async () => {
        await criarUtilizador({ email: "irene@empresa.pt", password: PASSWORD });

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
        await criarUtilizador({ email: "luis@empresa.pt", password: PASSWORD, ...opcoes });

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

// O login tem de escolher a conta que a password abre, não uma qualquer.
describe("POST /auth/login - o mesmo email em duas empresas", () => {
    const EMAIL = "geral@empresa.pt";
    const PASSWORD_A = "PasswordA1!";
    const PASSWORD_B = "PasswordB1!";

    const duasContas = async () => {
        const empresaA = await criarEmpresa();
        const empresaB = await criarEmpresa();

        return {
            contaA: await criarUtilizador({
                companyId: empresaA.id,
                email: EMAIL,
                password: PASSWORD_A,
            }),
            contaB: await criarUtilizador({
                companyId: empresaB.id,
                email: EMAIL,
                password: PASSWORD_B,
            }),
        };
    };

    it("autentica a conta da empresa A com a password da empresa A", async () => {
        const { contaA } = await duasContas();

        const res = await request(app)
            .post("/auth/login")
            .send({ email: EMAIL, password: PASSWORD_A });

        expect(res.status).toBe(200);
        expect(res.body.data.user.id).toBe(contaA.id);
        expect(jwt.verify(res.body.data.token, process.env.JWT_SECRET!)).toMatchObject({
            sub: String(contaA.id),
            companyId: contaA.companyId,
        });
    });

    it("autentica a conta cuja password corresponde, e não a primeira que encontra", async () => {
        const { contaA, contaB } = await duasContas();

        const res = await request(app)
            .post("/auth/login")
            .send({ email: EMAIL, password: PASSWORD_B });

        expect(res.status).toBe(200);
        expect(res.body.data.user.id).toBe(contaB.id);
        expect(res.body.data.user.id).not.toBe(contaA.id);
        expect(jwt.verify(res.body.data.token, process.env.JWT_SECRET!)).toMatchObject({
            sub: String(contaB.id),
            companyId: contaB.companyId,
        });
    });

    it("usa o companyId do corpo quando é indicado", async () => {
        const { contaB } = await duasContas();

        const res = await request(app)
            .post("/auth/login")
            .send({ email: EMAIL, password: PASSWORD_B, companyId: contaB.companyId });

        expect(res.status).toBe(200);
        expect(res.body.data.user.id).toBe(contaB.id);
    });

    it("devolve o mesmo 401 para uma password que não serve em nenhuma das contas", async () => {
        await duasContas();

        const passwordErrada = await request(app)
            .post("/auth/login")
            .send({ email: EMAIL, password: "NaoEEsta1!" });
        const emailErrado = await request(app)
            .post("/auth/login")
            .send({ email: "ninguem@empresa.pt", password: PASSWORD_A });

        expect(passwordErrada.status).toBe(401);
        expect(passwordErrada.body).toEqual(emailErrado.body);
    });

    it("devolve 409 com as empresas entre as quais escolher, por nome", async () => {
        const empresaZ = await criarEmpresa("Zulu Lda");
        const empresaA = await criarEmpresa("Alfa Lda");
        await criarUtilizador({ companyId: empresaZ.id, email: EMAIL, password: PASSWORD });
        await criarUtilizador({ companyId: empresaA.id, email: EMAIL, password: PASSWORD });

        const res = await request(app)
            .post("/auth/login")
            .send({ email: EMAIL, password: PASSWORD });

        expect(res.status).toBe(409);
        expect(res.body.message).toContain("companyId");
        expect(res.body.data).toEqual([
            { companyId: empresaA.id, companyName: "Alfa Lda" },
            { companyId: empresaZ.id, companyName: "Zulu Lda" },
        ]);
        // Sem token nenhum: o 409 é um passo do login, não um login feito.
        expect(res.body.data).not.toHaveProperty("token");
        expect(JSON.stringify(res.body)).not.toContain("$2");
    });

    it("o companyId devolvido no 409 serve para repetir o login", async () => {
        const empresaZ = await criarEmpresa("Zulu Lda");
        const empresaA = await criarEmpresa("Alfa Lda");
        await criarUtilizador({ companyId: empresaZ.id, email: EMAIL, password: PASSWORD });
        const contaA = await criarUtilizador({
            companyId: empresaA.id,
            email: EMAIL,
            password: PASSWORD,
        });

        const conflito = await request(app)
            .post("/auth/login")
            .send({ email: EMAIL, password: PASSWORD });

        const escolhida = conflito.body.data.find(
            (c: { companyName: string }) => c.companyName === "Alfa Lda",
        );

        const res = await request(app)
            .post("/auth/login")
            .send({ email: EMAIL, password: PASSWORD, companyId: escolhida.companyId });

        expect(res.status).toBe(200);
        expect(res.body.data.user.id).toBe(contaA.id);
        expect(jwt.verify(res.body.data.token, process.env.JWT_SECRET!)).toMatchObject({
            companyId: empresaA.id,
        });
    });

    it("não revela as empresas a quem não acerta na password", async () => {
        const empresaA = await criarEmpresa("Alfa Lda");
        const empresaZ = await criarEmpresa("Zulu Lda");
        await criarUtilizador({ companyId: empresaA.id, email: EMAIL, password: PASSWORD });
        await criarUtilizador({ companyId: empresaZ.id, email: EMAIL, password: PASSWORD });

        const res = await request(app)
            .post("/auth/login")
            .send({ email: EMAIL, password: "NaoEEsta1!" });

        expect(res.status).toBe(401);
        const corpo = JSON.stringify(res.body);
        expect(corpo).not.toContain("Alfa Lda");
        expect(corpo).not.toContain("Zulu Lda");
        expect(corpo).not.toContain(empresaA.id);
    });

    it("verifica a password antes do estado: a conta suspensa dá 403, a outra fica de fora", async () => {
        const empresaA = await criarEmpresa();
        const empresaB = await criarEmpresa();
        await criarUtilizador({
            companyId: empresaA.id,
            email: EMAIL,
            password: PASSWORD_A,
            status: UserStatus.Suspended,
        });
        await criarUtilizador({ companyId: empresaB.id, email: EMAIL, password: PASSWORD_B });

        const res = await request(app)
            .post("/auth/login")
            .send({ email: EMAIL, password: PASSWORD_A });

        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Conta não está ativa");
    });
});
