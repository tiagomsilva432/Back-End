import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { compare } from "bcrypt";
import request from "supertest";
import { app } from "../../src/app.js";
import { User } from "../../src/entities/User.js";
import { UserStatus } from "../../src/types/enums.js";
import { mailResetSpy } from "../helpers/mailer-spy.js";
import { criarEmpresa, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const users = () => repo(User);

const ATUAL = "Password1!";
const NOVA = "PasswordNova1!";
const EMAIL = "geral@empresa.pt";

const pedir = (corpo: object) => request(app).post("/auth/password/reset").send(corpo);

const confirmar = (corpo: object) =>
    request(app).post("/auth/password/reset/confirm").send(corpo);

const comPassword = (opcoes: { email?: string; companyId?: string; status?: UserStatus } = {}) =>
    criarUtilizador({
        ...opcoes,
        password: ATUAL,
        status: opcoes.status ?? UserStatus.Active,
        mustChangePassword: false,
    });

describe("POST /auth/password/reset", () => {
    it("cunha um token e envia o email a uma conta com password", async () => {
        const empresa = await criarEmpresa("ACME");
        const user = await comPassword({ email: EMAIL, companyId: empresa.id });

        const res = await pedir({ email: EMAIL });

        expect(res.status).toBe(200);

        const depois = await users().findOneBy({ id: user.id });
        expect(depois!.passwordResetToken).toEqual(expect.any(String));
        expect(mailResetSpy).toHaveBeenCalledWith(
            expect.objectContaining({ name: "ACME" }),
            EMAIL,
            expect.stringContaining(depois!.passwordResetToken!),
        );
    });

    it("a validade do token é de cerca de uma hora, não dos 7 dias do convite", async () => {
        const user = await comPassword({ email: EMAIL });

        await pedir({ email: EMAIL }).expect(200);

        const depois = await users().findOneBy({ id: user.id });
        const horas = (depois!.passwordResetExpiresAt!.getTime() - Date.now()) / 3_600_000;
        expect(horas).toBeGreaterThan(0.9);
        expect(horas).toBeLessThan(1.1);
    });

    it("responde o mesmo a um email que existe e a um que não existe", async () => {
        await comPassword({ email: EMAIL });

        const existe = await pedir({ email: EMAIL });
        const naoExiste = await pedir({ email: "ninguem@empresa.pt" });

        expect(existe.status).toBe(200);
        expect(existe.body).toEqual(naoExiste.body);
    });

    it("não envia nada para um email que não existe", async () => {
        const res = await pedir({ email: "ninguem@empresa.pt" });

        expect(res.status).toBe(200);
        expect(mailResetSpy).not.toHaveBeenCalled();
    });

    it("uma conta ainda convidada não recebe token: essa ativa-se", async () => {
        const convidado = await criarUtilizador({ email: EMAIL });

        const res = await pedir({ email: EMAIL });

        expect(res.status).toBe(200);
        expect(await users().findOneBy({ id: convidado.id })).toMatchObject({
            passwordResetToken: null,
        });
        expect(mailResetSpy).not.toHaveBeenCalled();
    });

    it("uma conta terminada não recebe token nem email, e a resposta é a mesma", async () => {
        const terminada = await comPassword({ email: EMAIL, status: UserStatus.Terminated });

        const res = await pedir({ email: EMAIL });
        const semMatch = await pedir({ email: "ninguem@empresa.pt" });

        expect(res.status).toBe(200);
        expect(res.body).toEqual(semMatch.body);
        expect(await users().findOneBy({ id: terminada.id })).toMatchObject({
            passwordResetToken: null,
        });
        expect(mailResetSpy).not.toHaveBeenCalled();
    });

    it("o mesmo email em duas empresas recebe dois tokens diferentes e dois emails", async () => {
        const empresaA = await criarEmpresa("Alfa Lda");
        const empresaB = await criarEmpresa("Zulu Lda");
        const contaA = await comPassword({ email: EMAIL, companyId: empresaA.id });
        const contaB = await comPassword({ email: EMAIL, companyId: empresaB.id });

        await pedir({ email: EMAIL }).expect(200);

        const depoisA = await users().findOneBy({ id: contaA.id });
        const depoisB = await users().findOneBy({ id: contaB.id });

        expect(depoisA!.passwordResetToken).toEqual(expect.any(String));
        expect(depoisB!.passwordResetToken).toEqual(expect.any(String));
        expect(depoisA!.passwordResetToken).not.toBe(depoisB!.passwordResetToken);
        expect(mailResetSpy).toHaveBeenCalledTimes(2);
    });

    it("o companyId opcional restringe a uma empresa", async () => {
        const empresaA = await criarEmpresa();
        const empresaB = await criarEmpresa();
        const contaA = await comPassword({ email: EMAIL, companyId: empresaA.id });
        const contaB = await comPassword({ email: EMAIL, companyId: empresaB.id });

        await pedir({ email: EMAIL, companyId: empresaA.id }).expect(200);

        expect((await users().findOneBy({ id: contaA.id }))!.passwordResetToken)
            .toEqual(expect.any(String));
        expect((await users().findOneBy({ id: contaB.id }))!.passwordResetToken).toBeNull();
        expect(mailResetSpy).toHaveBeenCalledTimes(1);
    });

    it("um companyId que não corresponde responde o mesmo e não envia nada", async () => {
        await comPassword({ email: EMAIL });
        const outra = await criarEmpresa();

        const res = await pedir({ email: EMAIL, companyId: outra.id });
        const semMatch = await pedir({ email: "ninguem@empresa.pt" });

        expect(res.body).toEqual(semMatch.body);
        expect(mailResetSpy).not.toHaveBeenCalled();
    });

    it("responde 200 e o mesmo corpo quando o envio do email falha", async () => {
        await comPassword({ email: EMAIL });
        mailResetSpy.mockRejectedValueOnce(new Error("SMTP em baixo"));

        const res = await pedir({ email: EMAIL });
        const semMatch = await pedir({ email: "ninguem@empresa.pt" });

        expect(res.status).toBe(200);
        expect(res.body).toEqual(semMatch.body);
    });

    it("nunca devolve o token", async () => {
        const user = await comPassword({ email: EMAIL });

        const res = await pedir({ email: EMAIL });
        const depois = await users().findOneBy({ id: user.id });

        expect(JSON.stringify(res.body)).not.toContain(depois!.passwordResetToken!);
        expect(res.body.data).toBeUndefined();
    });

    it("devolve 400 com um email malformado", async () => {
        const res = await pedir({ email: "sem-arroba" });

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: "email" })]),
        );
    });
});

describe("POST /auth/password/reset/confirm", () => {
    const pedirToken = async (status = UserStatus.Active) => {
        const user = await comPassword({ email: EMAIL, status });
        user.passwordResetToken = randomUUID();
        user.passwordResetExpiresAt = new Date(Date.now() + 3_600_000);
        await users().save(user);
        return user;
    };

    it("define a password nova e queima o token", async () => {
        const user = await pedirToken();

        const res = await confirmar({ token: user.passwordResetToken, password: NOVA });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ message: "Password redefinida com sucesso" });

        const depois = await users().findOneBy({ id: user.id });
        expect(await compare(NOVA, depois!.passwordHash!)).toBe(true);
        expect(depois).toMatchObject({
            passwordResetToken: null,
            passwordResetExpiresAt: null,
            mustChangePassword: false,
        });
        // O link também chegou por email.
        expect(depois!.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it("não mexe no status nem nas colunas do convite", async () => {
        const user = await pedirToken();

        await confirmar({ token: user.passwordResetToken, password: NOVA }).expect(200);

        expect(await users().findOneBy({ id: user.id })).toMatchObject({
            status: UserStatus.Active,
            signupToken: null,
            signupTokenExpiresAt: null,
        });
    });

    it("uma conta suspensa redefine a password e continua suspensa, sem conseguir entrar", async () => {
        const suspensa = await pedirToken(UserStatus.Suspended);

        const res = await confirmar({ token: suspensa.passwordResetToken, password: NOVA });

        expect(res.status).toBe(200);

        const depois = await users().findOneBy({ id: suspensa.id });
        expect(await compare(NOVA, depois!.passwordHash!)).toBe(true);
        expect(depois!.status).toBe(UserStatus.Suspended);

        const login = await request(app)
            .post("/auth/login")
            .send({ email: EMAIL, password: NOVA });

        expect(login.status).toBe(403);
    });

    it("recusa o mesmo token uma segunda vez", async () => {
        const user = await pedirToken();

        await confirmar({ token: user.passwordResetToken, password: NOVA }).expect(200);

        const res = await confirmar({ token: user.passwordResetToken, password: "OutraNova1!" });

        expect(res.status).toBe(401);
    });

    it("devolve 401 quando o token não existe", async () => {
        const res = await confirmar({ token: randomUUID(), password: NOVA });

        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ status: 401, message: "Token Inválido" });
    });

    it("devolve 401 quando o token já expirou, e não troca a password", async () => {
        const user = await comPassword({ email: EMAIL });
        user.passwordResetToken = randomUUID();
        user.passwordResetExpiresAt = new Date(Date.now() - 3_600_000);
        await users().save(user);

        const res = await confirmar({ token: user.passwordResetToken, password: NOVA });

        expect(res.status).toBe(401);
        const depois = await users().findOneBy({ id: user.id });
        expect(await compare(ATUAL, depois!.passwordHash!)).toBe(true);
    });

    it("um token de ativação não serve para redefinir a password", async () => {
        const convidado = await criarUtilizador({
            email: EMAIL,
            signupToken: randomUUID(),
            signupTokenExpiresAt: new Date(Date.now() + 3_600_000),
        });

        const res = await confirmar({ token: convidado.signupToken, password: NOVA });

        expect(res.status).toBe(401);
    });

    it("um token de redefinição não serve para ativar uma conta", async () => {
        const user = await pedirToken();

        const res = await request(app)
            .post("/auth/account/activate")
            .send({ signupToken: user.passwordResetToken, password: NOVA });

        expect(res.status).toBe(401);
    });

    it.each([
        ["curta de mais", "Ab1!"],
        ["sem número", "Password!"],
    ])("devolve 400 com uma password %s", async (_nome, password) => {
        const user = await pedirToken();

        const res = await confirmar({ token: user.passwordResetToken, password });

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: "password" })]),
        );
    });

    it("do pedido ao login: a password nova entra e a antiga deixa de servir", async () => {
        const user = await comPassword({ email: EMAIL });

        await pedir({ email: EMAIL }).expect(200);

        const comToken = await users().findOneBy({ id: user.id });
        await confirmar({ token: comToken!.passwordResetToken, password: NOVA }).expect(200);

        const nova = await request(app)
            .post("/auth/login")
            .send({ email: EMAIL, password: NOVA });
        const antiga = await request(app)
            .post("/auth/login")
            .send({ email: EMAIL, password: ATUAL });

        expect(nova.status).toBe(200);
        expect(antiga.status).toBe(401);
    });
});
