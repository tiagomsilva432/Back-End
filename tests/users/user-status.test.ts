import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { User } from "../../src/entities/User.js";
import { UserRole, UserStatus } from "../../src/types/enums.js";
import { authorization, createActor } from "../helpers/auth.js";
import { criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const utilizadores = () => repo(User);

const alterar = (id: string, header: string | undefined, corpo: object) => {
    const pedido = request(app).patch(`/users/${id}/status`);
    return (header === undefined ? pedido : pedido.set("Authorization", header)).send(corpo);
};

/** Um employee ativo na empresa de um company_admin. */
const cenario = async (status = UserStatus.Active) => {
    const { user: actor, header } = await createActor(UserRole.CompanyAdmin);
    const alvo = await criarUtilizador({
        companyId: actor.companyId,
        status,
        mustChangePassword: false,
        ...(status === UserStatus.Invited
            ? { signupToken: randomUUID(), signupTokenExpiresAt: new Date(Date.now() + 86_400_000) }
            : { password: "Password1!" }),
    });

    return { actor, header, alvo };
};

describe("PATCH /users/:id/status", () => {
    it("suspende uma conta ativa", async () => {
        const { header, alvo } = await cenario();

        const res = await alterar(alvo.id, header, { status: "suspended" });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Estado da conta atualizado" });
        expect(res.body.data).toMatchObject({ id: alvo.id, status: UserStatus.Suspended });
        expect(res.body.data).not.toHaveProperty("passwordHash");
        expect(await utilizadores().findOneBy({ id: alvo.id })).toMatchObject({
            status: UserStatus.Suspended,
        });
    });

    it("uma conta suspensa perde o acesso no pedido seguinte", async () => {
        const { header, alvo } = await cenario();
        const tokenDoAlvo = authorization(alvo);

        await alterar(alvo.id, header, { status: "suspended" }).expect(200);

        const res = await request(app).get("/users").set("Authorization", tokenDoAlvo);

        expect(res.status).toBe(403);
    });

    it("reativa uma conta suspensa", async () => {
        const { header, alvo } = await cenario(UserStatus.Suspended);

        const res = await alterar(alvo.id, header, { status: "active" });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe(UserStatus.Active);
    });

    it("terminar um convite revoga o link de ativação", async () => {
        const { header, alvo } = await cenario(UserStatus.Invited);

        const res = await alterar(alvo.id, header, { status: "terminated" });

        expect(res.status).toBe(200);
        expect(await utilizadores().findOneBy({ id: alvo.id })).toMatchObject({
            status: UserStatus.Terminated,
            signupToken: null,
            signupTokenExpiresAt: null,
        });

        const ativar = await request(app)
            .post("/auth/account/activate")
            .send({ signupToken: alvo.signupToken, password: "Password1!" });

        expect(ativar.status).toBe(401);
    });

    it("pedir o estado que a conta já tem responde 200 sem mudar nada", async () => {
        const { header, alvo } = await cenario();

        const res = await alterar(alvo.id, header, { status: "active" });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe(UserStatus.Active);
    });

    it.each([
        [UserStatus.Terminated, "active"],
        [UserStatus.Terminated, "suspended"],
        [UserStatus.Invited, "active"],
        [UserStatus.Invited, "suspended"],
    ])("recusa passar uma conta %s a %s", async (de, para) => {
        const { header, alvo } = await cenario(de);

        const res = await alterar(alvo.id, header, { status: para });

        expect(res.status).toBe(409);
        expect(await utilizadores().findOneBy({ id: alvo.id })).toMatchObject({ status: de });
    });

    it("ninguém altera o estado da sua própria conta", async () => {
        const { user, header } = await createActor(UserRole.SystemAdmin);

        const res = await alterar(user.id, header, { status: "suspended" });

        expect(res.status).toBe(403);
        expect(await utilizadores().findOneBy({ id: user.id })).toMatchObject({
            status: UserStatus.Active,
        });
    });

    it("um company_admin não altera outro company_admin", async () => {
        const { actor, header } = await cenario();
        const colega = await criarUtilizador({
            companyId: actor.companyId,
            role: UserRole.CompanyAdmin,
            password: "Password1!",
            status: UserStatus.Active,
        });

        const res = await alterar(colega.id, header, { status: "suspended" });

        expect(res.status).toBe(403);
    });

    it("um system_admin suspende um company_admin de qualquer empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const admin = await criarUtilizador({
            role: UserRole.CompanyAdmin,
            password: "Password1!",
            status: UserStatus.Active,
        });

        const res = await alterar(admin.id, header, { status: "suspended" });

        expect(res.status).toBe(200);
    });

    it("responde o mesmo a um utilizador de outra empresa e a um que não existe", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const alheio = await criarUtilizador({ password: "Password1!", status: UserStatus.Active });

        const foraDeAlcance = await alterar(alheio.id, header, { status: "suspended" });
        const inexistente = await alterar(randomUUID(), header, { status: "suspended" });

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
        expect(await utilizadores().findOneBy({ id: alheio.id })).toMatchObject({
            status: UserStatus.Active,
        });
    });

    it("recusa a um employee alterar o estado de um colega", async () => {
        const { user: actor, header } = await createActor(UserRole.Employee);
        const colega = await criarUtilizador({
            companyId: actor.companyId,
            password: "Password1!",
            status: UserStatus.Active,
        });

        const res = await alterar(colega.id, header, { status: "suspended" });

        expect(res.status).toBe(403);
    });

    it("devolve 401 sem token", async () => {
        const res = await alterar(randomUUID(), undefined, { status: "suspended" });

        expect(res.status).toBe(401);
    });

    it.each([
        ["o corpo vazio", {}],
        ["o estado invited", { status: "invited" }],
        ["um estado desconhecido", { status: "banido" }],
    ])("devolve 400 com %s", async (_titulo, corpo) => {
        const { header, alvo } = await cenario();

        const res = await alterar(alvo.id, header, corpo);

        expect(res.status).toBe(400);
    });
});
