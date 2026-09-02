import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { compare } from "bcrypt";
import { app } from "../../src/app.js";
import { criarUtilizador } from "../helpers/factories.js";
import { sql } from "../setup/db.js";

const PASSWORD_VALIDA = "Password1!";

async function criarConvite(email = "convidado@empresa.pt") {
    const signupToken = randomUUID();
    await criarUtilizador({
        email,
        signupToken,
        signupTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return signupToken;
}

describe("POST /auth/account/activate", () => {
    it("ativa a conta, guarda o hash e queima o token", async () => {
        const signupToken = await criarConvite();

        const res = await request(app)
            .post("/auth/account/activate")
            .send({ signupToken, password: PASSWORD_VALIDA });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            status: 200,
            message: "Conta ativada com sucesso",
        });

        const [linha] = await sql<Array<Record<string, unknown>>>(
            `SELECT status, password_hash, must_change_password,
                    signup_token, signup_token_expires_at
               FROM users WHERE email = $1`,
            ["convidado@empresa.pt"],
        );

        expect(linha).toMatchObject({
            status: "active",
            must_change_password: false,
            signup_token: null,
            signup_token_expires_at: null,
        });


        const hash = linha!["password_hash"] as string;
        expect(hash).not.toBe(PASSWORD_VALIDA);
        expect(hash.startsWith("$2")).toBe(true);
        expect(await compare(PASSWORD_VALIDA, hash)).toBe(true);
    });

    it("recusa o mesmo token uma segunda vez", async () => {
        const signupToken = await criarConvite();

        await request(app)
            .post("/auth/account/activate")
            .send({ signupToken, password: PASSWORD_VALIDA })
            .expect(200);
        const res = await request(app)
            .post("/auth/account/activate")
            .send({ signupToken, password: "OutraPassword1!" });

        expect(res.status).toBe(401);
    });

    it("devolve 401 quando o token não existe", async () => {
        const res = await request(app)
            .post("/auth/account/activate")
            .send({ signupToken: randomUUID(), password: PASSWORD_VALIDA });

        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ status: 401, message: "Token Inválido" });
    });

    it("devolve 401 quando o token já expirou", async () => {
        const signupToken = randomUUID();
        await criarUtilizador({
            email: "atrasado@empresa.pt",
            signupToken,
            signupTokenExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        });

        const res = await request(app)
            .post("/auth/account/activate")
            .send({ signupToken, password: PASSWORD_VALIDA });

        expect(res.status).toBe(401);

        const [linha] = await sql<Array<{ status: string; password_hash: string | null }>>(
            `SELECT status, password_hash FROM users WHERE email = $1`,
            ["atrasado@empresa.pt"],
        );
        expect(linha).toMatchObject({ status: "invited", password_hash: null });
    });

    it.each([
        ["curta de mais", "Ab1!"],
        ["sem maiúscula", "password1!"],
        ["sem minúscula", "PASSWORD1!"],
        ["sem número", "Password!"],
        ["sem caracter especial", "Password1"],
    ])("devolve 400 com uma password %s", async (_nome, password) => {
        const signupToken = await criarConvite();

        const res = await request(app)
            .post("/auth/account/activate")
            .send({ signupToken, password });

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: "password" })]),
        );

        const [linha] = await sql<Array<{ status: string }>>(
            `SELECT status FROM users WHERE signup_token = $1`,
            [signupToken],
        );
        expect(linha!.status).toBe("invited");
    });
});
