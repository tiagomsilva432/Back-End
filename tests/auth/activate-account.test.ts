import { beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { compare } from "bcrypt";
import { app } from "../../src/app.js";
import { User } from "../../src/entities/User.js";
import { criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

describe("POST /auth/account/activate", () => {

    const PASSWORD_VALIDA = "Password1!";
    const users = () => repo(User);

    async function criarConvite(email = "convidado@empresa.pt") {
        const signupToken = randomUUID();
        await criarUtilizador({
            email,
            signupToken,
            signupTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
        return signupToken;
    }

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

        const user = await users().findOneBy({ email: "convidado@empresa.pt" });

        expect(user).toMatchObject({
            status: "active",
            mustChangePassword: false,
            signupToken: null,
            signupTokenExpiresAt: null,
        });

        expect(user!.passwordHash).not.toBe(PASSWORD_VALIDA);
        expect(await compare(PASSWORD_VALIDA, user!.passwordHash!)).toBe(true);
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
        expect(await users().findOneBy({ email: "atrasado@empresa.pt" })).toMatchObject({
            status: "invited",
            passwordHash: null,
        });
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
        expect(await users().findOneBy({ signupToken })).toMatchObject({ status: "invited" });
    });
});
