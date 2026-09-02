import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../src/app.js";
import { criarEmpresa } from "./helpers/factories.js";
import { sql } from "./setup/db.js";

describe("registo completo: criar -> ativar -> entrar", () => {
    it("leva uma conta de convidada a autenticada", async () => {
        const empresa = await criarEmpresa();
        const email = "mariana@empresa.pt";
        const password = "Password1!";

        const criacao = await request(app)
            .post("/auth/account/create")
            .send({ companyId: empresa.id, email, role: "employee" })
            .expect(201);

        const signupToken: string = criacao.body.data.signupToken;
        expect(signupToken).toEqual(expect.any(String));

        await request(app).post("/auth/login").send({ email, password }).expect(401);

        await request(app)
            .post("/auth/account/activate")
            .send({ signupToken, password })
            .expect(200);

        const login = await request(app)
            .post("/auth/login")
            .send({ email, password })
            .expect(200);

        expect(login.body.data.token).toEqual(expect.any(String));
        expect(login.body.data.user).toMatchObject({ email, role: "employee" });

        const [linha] = await sql<Array<Record<string, unknown>>>(
            `SELECT status, must_change_password, signup_token
               FROM users WHERE email = $1`,
            [email],
        );
        expect(linha).toMatchObject({
            status: "active",
            must_change_password: false,
            signup_token: null,
        });
    });
});

describe("a montagem dos testes", () => {
    it("não vê nada do que os testes anteriores gravaram", async () => {
        const linhas = await sql<Array<{ total: number }>>(
            `SELECT COUNT(*)::int AS total FROM users`,
        );
        expect(linhas[0]!.total).toBe(0);
    });

    it("correu as migrações todas, incluindo o seed", async () => {
        const skills = await sql<Array<{ total: number }>>(
            `SELECT COUNT(*)::int AS total FROM skills`,
        );
        expect(skills[0]!.total).toBe(20);

        const migracoes = await sql<Array<{ name: string }>>(
            `SELECT name FROM migrations ORDER BY timestamp`,
        );
        expect(migracoes.map((m) => m.name)).toEqual([
            "InitialSchema1785158103760",
            "TwoStepSignup1785161581791",
            "SeedBaseData1785165000000",
        ]);
    });

    it("está mesmo a falar com um Postgres", async () => {
        const [linha] = await sql<Array<{ versao: string }>>(`SELECT version() AS versao`);
        expect(linha!.versao).toContain("PostgreSQL 18");
    });
});