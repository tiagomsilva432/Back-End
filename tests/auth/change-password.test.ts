import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { compare } from "bcrypt";
import request from "supertest";
import { app } from "../../src/app.js";
import { User } from "../../src/entities/User.js";
import { UserRole, UserStatus } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const users = () => repo(User);

const ATUAL = "Password1!";
const NOVA = "PasswordNova1!";

const trocar = (header: string | undefined, corpo: object) => {
    const pedido = request(app).post("/auth/password/change");
    return (header === undefined ? pedido : pedido.set("Authorization", header)).send(corpo);
};

describe("POST /auth/password/change", () => {
    it("troca a password da própria conta", async () => {
        const { user, header } = await createActor(UserRole.Employee);

        const res = await trocar(header, { currentPassword: ATUAL, newPassword: NOVA });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Password alterada com sucesso" });

        const depois = await users().findOneBy({ id: user.id });
        expect(await compare(NOVA, depois!.passwordHash!)).toBe(true);
        expect(await compare(ATUAL, depois!.passwordHash!)).toBe(false);
    });

    it("uma conta com mustChangePassword consegue trocar, e fica desbloqueada", async () => {
        const presa = await criarUtilizador({
            password: ATUAL,
            status: UserStatus.Active,
            mustChangePassword: true,
        });
        const header = authorization(presa);

        // Antes: a conta é recusada em todo o resto da API.
        await request(app).get("/users").set("Authorization", header).expect(403);

        const res = await trocar(header, { currentPassword: ATUAL, newPassword: NOVA });

        expect(res.status).toBe(200);
        expect(await users().findOneBy({ id: presa.id })).toMatchObject({
            mustChangePassword: false,
        });

        // Depois: o MESMO token passa, sem novo login.
        await request(app).get("/users").set("Authorization", header).expect(200);
    });

    it("aceita uma password atual que não cumpre a política de hoje", async () => {
        const antiga = await criarUtilizador({
            password: "fraca",
            status: UserStatus.Active,
            mustChangePassword: false,
        });

        const res = await trocar(authorization(antiga), {
            currentPassword: "fraca",
            newPassword: NOVA,
        });

        expect(res.status).toBe(200);
    });

    it("queima qualquer recuperação pendente", async () => {
        const { user, header } = await createActor(UserRole.Employee);
        const alvo = await users().findOneBy({ id: user.id });
        alvo!.passwordResetToken = randomUUID();
        alvo!.passwordResetExpiresAt = new Date(Date.now() + 3_600_000);
        alvo!.signupToken = randomUUID();
        alvo!.signupTokenExpiresAt = new Date(Date.now() + 3_600_000);
        await users().save(alvo!);

        await trocar(header, { currentPassword: ATUAL, newPassword: NOVA }).expect(200);

        expect(await users().findOneBy({ id: user.id })).toMatchObject({
            passwordResetToken: null,
            passwordResetExpiresAt: null,
            signupToken: null,
            signupTokenExpiresAt: null,
        });
    });

    it("devolve 401 com a password atual errada, e não troca nada", async () => {
        const { user, header } = await createActor(UserRole.Employee);

        const res = await trocar(header, { currentPassword: "NaoEEsta1!", newPassword: NOVA });

        expect(res.status).toBe(401);
        expect(res.body.message).toBe("Credenciais Inválidas");

        const depois = await users().findOneBy({ id: user.id });
        expect(await compare(ATUAL, depois!.passwordHash!)).toBe(true);
    });

    it("devolve 401 para uma conta sem password definida", async () => {
        const convidado = await criarUtilizador({
            status: UserStatus.Active,
            mustChangePassword: false,
        });

        const res = await trocar(authorization(convidado), {
            currentPassword: ATUAL,
            newPassword: NOVA,
        });

        expect(res.status).toBe(401);
    });

    it("devolve 400 quando a password nova é igual à atual", async () => {
        const { header } = await createActor(UserRole.Employee);

        const res = await trocar(header, { currentPassword: ATUAL, newPassword: ATUAL });

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: "newPassword" })]),
        );
    });

    it.each([
        ["suspensa", UserStatus.Suspended],
        ["terminada", UserStatus.Terminated],
    ])("devolve 403 para uma conta %s, e não troca nada", async (_nome, status) => {
        const alvo = await criarUtilizador({
            password: ATUAL,
            status,
            mustChangePassword: false,
        });

        const res = await trocar(authorization(alvo), {
            currentPassword: ATUAL,
            newPassword: NOVA,
        });

        expect(res.status).toBe(403);
        const depois = await users().findOneBy({ id: alvo.id });
        expect(await compare(ATUAL, depois!.passwordHash!)).toBe(true);
    });

    it.each([
        ["curta de mais", "Ab1!"],
        ["sem maiúscula", "password1!"],
        ["sem minúscula", "PASSWORD1!"],
        ["sem número", "Password!"],
        ["sem caracter especial", "Password1"],
    ])("devolve 400 com uma password nova %s", async (_nome, newPassword) => {
        const { user, header } = await createActor(UserRole.Employee);

        const res = await trocar(header, { currentPassword: ATUAL, newPassword });

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: "newPassword" })]),
        );
        const depois = await users().findOneBy({ id: user.id });
        expect(await compare(ATUAL, depois!.passwordHash!)).toBe(true);
    });

    it("devolve 400 com a password atual vazia", async () => {
        const { header } = await createActor(UserRole.Employee);

        const res = await trocar(header, { currentPassword: "", newPassword: NOVA });

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: "currentPassword" })]),
        );
    });

    it("devolve 401 sem token", async () => {
        const res = await trocar(undefined, { currentPassword: ATUAL, newPassword: NOVA });

        expect(res.status).toBe(401);
    });

    it("devolve 401 com o token de uma conta que já não existe", async () => {
        const { user, header } = await createActor(UserRole.Employee);
        await users().delete({ id: user.id });

        const res = await trocar(header, { currentPassword: ATUAL, newPassword: NOVA });

        expect(res.status).toBe(401);
    });
});
