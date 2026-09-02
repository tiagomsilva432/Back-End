import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { logSpy } from "../helpers/console-spy.js";
import { criarEmpresa, criarUtilizador } from "../helpers/factories.js";
import { sql } from "../setup/db.js";

describe("POST /auth/account/create", () => {
    it("cria a conta e grava-a na base de dados", async () => {
        const empresa = await criarEmpresa();

        const res = await request(app)
            .post("/auth/account/create")
            .send({ companyId: empresa.id, email: "  ANA@Empresa.pt  ", role: "employee" });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
            status: 201,
            message: "Conta criada",
            code: "SUCCESS_CREATED",
        });

        const linhas = await sql<Array<Record<string, unknown>>>(
            `SELECT company_id, email, role, status, signup_token,
                    signup_token_expires_at, password_hash, must_change_password
               FROM users
              WHERE email = $1`,
            ["ana@empresa.pt"],
        );

        expect(linhas).toHaveLength(1);
        expect(linhas[0]).toMatchObject({
            email: "ana@empresa.pt",
            role: "employee",
            status: "invited",
            password_hash: null,
            must_change_password: true,
        });

        expect(linhas[0]!["signup_token"]).toEqual(expect.any(String));

        const expira = linhas[0]!["signup_token_expires_at"] as Date;
        expect(expira).toBeInstanceOf(Date);
        expect(expira.getTime()).toBeGreaterThan(Date.now());
    });

    it("regista o URL de ativação com o token que gravou", async () => {
        const empresa = await criarEmpresa();

        await request(app)
            .post("/auth/account/create")
            .send({ companyId: empresa.id, email: "bruno@empresa.pt" })
            .expect(201);

        const [linha] = await sql<Array<{ signup_token: string }>>(
            `SELECT signup_token FROM users WHERE email = $1`,
            ["bruno@empresa.pt"],
        );

        expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                `http://localhost:3000/auth/account/activate?token=${linha!.signup_token}`,
            ),
        );
    });

    it("um admin nasce sem token de ativação", async () => {
        const empresa = await criarEmpresa();

        await request(app)
            .post("/auth/account/create")
            .send({ companyId: empresa.id, email: "chefe@empresa.pt", role: "ADMIN" })
            .expect(201);

        const [linha] = await sql<Array<Record<string, unknown>>>(
            `SELECT role, signup_token, signup_token_expires_at
               FROM users WHERE email = $1`,
            ["chefe@empresa.pt"],
        );

        expect(linha).toMatchObject({
            role: "admin",
            signup_token: null,
            signup_token_expires_at: null,
        });
    });

    it("assume o papel de employee quando nenhum é indicado", async () => {
        const empresa = await criarEmpresa();

        await request(app)
            .post("/auth/account/create")
            .send({ companyId: empresa.id, email: "diana@empresa.pt" })
            .expect(201);

        const [linha] = await sql<Array<{ role: string }>>(
            `SELECT role FROM users WHERE email = $1`,
            ["diana@empresa.pt"],
        );
        expect(linha!.role).toBe("employee");
    });

    it("devolve 409 quando o email já existe na mesma empresa", async () => {
        const utilizador = await criarUtilizador({ email: "eva@empresa.pt" });

        const res = await request(app)
            .post("/auth/account/create")
            .send({ companyId: utilizador.companyId, email: "eva@empresa.pt" });

        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ status: 409 });

        const linhas = await sql<Array<{ total: number }>>(
            `SELECT COUNT(*)::int AS total FROM users WHERE email = $1`,
            ["eva@empresa.pt"],
        );
        expect(linhas[0]!.total).toBe(1);
    });

    it("aceita o mesmo email em empresas diferentes", async () => {
        const empresaA = await criarEmpresa();
        const empresaB = await criarEmpresa();

        await request(app)
            .post("/auth/account/create")
            .send({ companyId: empresaA.id, email: "geral@empresa.pt" })
            .expect(201);

        await request(app)
            .post("/auth/account/create")
            .send({ companyId: empresaB.id, email: "geral@empresa.pt" })
            .expect(201);

        const linhas = await sql<Array<{ total: number }>>(
            `SELECT COUNT(*)::int AS total FROM users WHERE email = $1`,
            ["geral@empresa.pt"],
        );
        expect(linhas[0]!.total).toBe(2);
    });
});

describe("POST /auth/account/create — validação do corpo", () => {
    it.each([
        ["companyId em falta", { email: "a@b.pt" }, "companyId"],
        ["companyId como texto", { companyId: "1", email: "a@b.pt" }, "companyId"],
        ["companyId igual a 0", { companyId: 0, email: "a@b.pt" }, "companyId"],
        ["email em falta", { companyId: 1 }, "email"],
        ["email sem @", { companyId: 1, email: "isto-nao-e-um-email" }, "email"],
        ["role fora do enum", { companyId: 1, email: "a@b.pt", role: "chefe" }, "role"],
    ])("devolve 400 quando: %s", async (_nome, corpo, campoComErro) => {
        const res = await request(app).post("/auth/account/create").send(corpo);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ field: campoComErro, message: expect.any(String) }),
            ]),
        );
    });

    it("não grava nada quando o corpo é inválido", async () => {
        await request(app)
            .post("/auth/account/create")
            .send({ email: "fantasma@empresa.pt" })
            .expect(400);
        const linhas = await sql<Array<{ total: number }>>(
            `SELECT COUNT(*)::int AS total FROM users WHERE email = $1`,
            ["fantasma@empresa.pt"],
        );
        expect(linhas[0]!.total).toBe(0);
    });

    it("ignora em silêncio os campos que não conhece", async () => {
        const empresa = await criarEmpresa();

        await request(app)
            .post("/auth/account/create")
            .send({ companyId: empresa.id, email: "flavio@empresa.pt", hacker: true })
            .expect(201);

        const linhas = await sql<Array<{ total: number }>>(
            `SELECT COUNT(*)::int AS total FROM users WHERE email = $1`,
            ["flavio@empresa.pt"],
        );
        expect(linhas[0]!.total).toBe(1);
    });
});
