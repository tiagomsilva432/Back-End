import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { User } from "../../src/entities/User.js";
import { UserRole, UserStatus } from "../../src/types/enums.js";
import { createActor } from "../helpers/auth.js";
import { mailSpy } from "../helpers/mailer-spy.js";
import { criarEmpresa, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const users = () => repo(User);

const reenviar = (id: string, header?: string) => {
    const pedido = request(app).post(`/auth/account/${id}/resend-activation`);
    return header === undefined ? pedido : pedido.set("Authorization", header);
};

const convite = (companyId: string, expiraEm: number) =>
    criarUtilizador({
        companyId,
        signupToken: randomUUID(),
        signupTokenExpiresAt: new Date(Date.now() + expiraEm),
    });

const UM_DIA = 24 * 60 * 60 * 1000;

describe("POST /auth/account/:id/resend-activation", () => {
    it("cunha um token novo e empurra a validade", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const convidado = await convite(gestora.companyId, UM_DIA);

        const res = await reenviar(convidado.id, header);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Ativação reenviada" });

        const depois = await users().findOneBy({ id: convidado.id });
        expect(depois!.signupToken).not.toBe(convidado.signupToken);
        expect(depois!.signupTokenExpiresAt!.getTime())
            .toBeGreaterThan(convidado.signupTokenExpiresAt!.getTime());
    });

    it("envia o email com o link do token novo", async () => {
        const empresa = await criarEmpresa("ACME");
        const { header } = await createActor(UserRole.CompanyAdmin, empresa.id);
        const convidado = await convite(empresa.id, UM_DIA);

        await reenviar(convidado.id, header).expect(200);

        const depois = await users().findOneBy({ id: convidado.id });
        expect(mailSpy).toHaveBeenCalledWith(
            expect.objectContaining({ name: "ACME" }),
            convidado.email,
            expect.stringContaining(depois!.signupToken!),
        );
    });

    it("recupera um convite cujo token já expirou: reenviar, ativar e entrar", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const convidado = await convite(gestora.companyId, -UM_DIA);

        // Antes: o token velho já não serve.
        await request(app)
            .post("/auth/account/activate")
            .send({ signupToken: convidado.signupToken, password: "Password1!" })
            .expect(401);

        await reenviar(convidado.id, header).expect(200);

        const novo = await users().findOneBy({ id: convidado.id });

        await request(app)
            .post("/auth/account/activate")
            .send({ signupToken: novo!.signupToken, password: "Password1!" })
            .expect(200);

        const login = await request(app)
            .post("/auth/login")
            .send({ email: convidado.email, password: "Password1!" });

        expect(login.status).toBe(200);
        expect(login.body.data.user.id).toBe(convidado.id);
    });

    it("nunca devolve o token", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const convidado = await convite(gestora.companyId, UM_DIA);

        const res = await reenviar(convidado.id, header);
        const depois = await users().findOneBy({ id: convidado.id });

        expect(res.body.data).toBeUndefined();
        expect(JSON.stringify(res.body)).not.toContain(depois!.signupToken!);
        expect(JSON.stringify(res.body)).not.toContain("signupToken");
    });

    it("reenvia na mesma quando o envio do email falha, e o token fica gravado", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const convidado = await convite(gestora.companyId, UM_DIA);
        mailSpy.mockRejectedValueOnce(new Error("SMTP em baixo"));

        const res = await reenviar(convidado.id, header);

        expect(res.status).toBe(200);
        const depois = await users().findOneBy({ id: convidado.id });
        expect(depois!.signupToken).not.toBe(convidado.signupToken);
    });

    it.each([
        ["ativa", UserStatus.Active],
        ["suspensa", UserStatus.Suspended],
        ["terminada", UserStatus.Terminated],
    ])("devolve 409 para uma conta %s, e não mexe no token", async (_nome, status) => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const alvo = await criarUtilizador({
            companyId: gestora.companyId,
            status,
            signupToken: randomUUID(),
            signupTokenExpiresAt: new Date(Date.now() + UM_DIA),
        });

        const res = await reenviar(alvo.id, header);

        expect(res.status).toBe(409);
        expect(await users().findOneBy({ id: alvo.id })).toMatchObject({
            signupToken: alvo.signupToken,
        });
    });

    it("um system_admin reenvia a ativação de um company_admin", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const empresa = await criarEmpresa();
        const alvo = await criarUtilizador({
            companyId: empresa.id,
            role: UserRole.CompanyAdmin,
            signupToken: randomUUID(),
            signupTokenExpiresAt: new Date(Date.now() + UM_DIA),
        });

        const res = await reenviar(alvo.id, header);

        expect(res.status).toBe(200);
    });

    it("um system_admin também reenvia a de um employee", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const empresa = await criarEmpresa();
        const alvo = await convite(empresa.id, UM_DIA);

        const res = await reenviar(alvo.id, header);

        expect(res.status).toBe(200);
    });

    it("recusa a um company_admin reenviar a de outro company_admin", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const par = await criarUtilizador({
            companyId: gestora.companyId,
            role: UserRole.CompanyAdmin,
            signupToken: randomUUID(),
            signupTokenExpiresAt: new Date(Date.now() + UM_DIA),
        });

        const res = await reenviar(par.id, header);

        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Sem permissões para reenviar a ativação desta conta");
    });

    it("responde o mesmo a uma conta de outra empresa e a uma que não existe", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();
        const alheio = await convite(outra.id, UM_DIA);

        const foraDeAlcance = await reenviar(alheio.id, header);
        const inexistente = await reenviar(randomUUID(), header);

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
    });

    it("recusa a um employee reenviar ativações", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);
        const alvo = await convite(empregado.companyId, UM_DIA);

        const res = await reenviar(alvo.id, header);

        expect(res.status).toBe(403);
    });

    it("devolve 404, e não 500, para um id que não é uuid", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await reenviar("nao-e-um-uuid", header);

        expect(res.status).toBe(404);
    });

    it("devolve 401 sem token", async () => {
        const res = await reenviar(randomUUID());

        expect(res.status).toBe(401);
    });
});
