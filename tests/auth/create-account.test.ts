import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { User } from "../../src/entities/User.js";
import { UserRole } from "../../src/types/enums.js";
import { logSpy } from "../helpers/console-spy.js";
import { mailSpy } from "../helpers/mailer-spy.js";
import { createActor } from "../helpers/auth.js";
import { criarEmpresa, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const users = () => repo(User);

describe("POST /auth/account/create", () => {
    it("cria a conta e grava-a na base de dados", async () => {
        const empresa = await criarEmpresa();
        const { header } = await createActor(UserRole.CompanyAdmin, empresa.id);

        const res = await request(app)
            .post("/auth/account/create")
            .set("Authorization", header)
            .send({ companyId: empresa.id, email: "  ANA@Empresa.pt  ", role: "employee" });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
            status: 201,
            message: "Conta criada",
            code: "SUCCESS_CREATED",
        });

        const user = await users().findOneBy({ email: "ana@empresa.pt" });

        expect(user).toMatchObject({
            companyId: empresa.id,
            role: "employee",
            status: "invited",
            passwordHash: null,
            mustChangePassword: true,
        });
        expect(user!.signupToken).toEqual(expect.any(String));
        expect(user!.signupTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it("não devolve o signupToken nem o passwordHash", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await request(app)
            .post("/auth/account/create")
            .set("Authorization", header)
            .send({ email: "bruno@empresa.pt" })
            .expect(201);

        expect(res.body.data).toEqual({
            id: expect.any(String),
            companyId: expect.any(String),
            email: "bruno@empresa.pt",
            role: "employee",
            status: "invited",
        });
        expect(JSON.stringify(res.body)).not.toContain("signupToken");
        expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });

    it("regista o URL de ativação com o token que gravou", async () => {
        const empresa = await criarEmpresa();
        const { header } = await createActor(UserRole.CompanyAdmin, empresa.id);

        await request(app)
            .post("/auth/account/create")
            .set("Authorization", header)
            .send({ companyId: empresa.id, email: "carla@empresa.pt" })
            .expect(201);

        const user = await users().findOneBy({ email: "carla@empresa.pt" });

        expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                `${process.env.FE_URL}/auth/account/activate?token=${user!.signupToken}`,
            ),
        );
    });

    it("um company_admin criado por um system_admin recebe token e email de ativação", async () => {
        const empresa = await criarEmpresa("ACME", "geral@acme.pt");
        const { header } = await createActor(UserRole.SystemAdmin);

        await request(app)
            .post("/auth/account/create")
            .set("Authorization", header)
            .send({ companyId: empresa.id, email: "gestora@empresa.pt", role: "company_admin" })
            .expect(201);

        const user = await users().findOneBy({ email: "gestora@empresa.pt" });

        expect(user).toMatchObject({ role: "company_admin", status: "invited" });
        expect(user!.signupToken).toEqual(expect.any(String));
        expect(user!.signupTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now());
        expect(mailSpy).toHaveBeenCalledWith(
            expect.objectContaining({ name: "ACME" }),
            "gestora@empresa.pt",
            expect.stringContaining(user!.signupToken!),
        );
    });

    it("envia o email de ativação ao employee, com o link do token", async () => {
        const empresa = await criarEmpresa("ACME", "geral@acme.pt");
        const { header } = await createActor(UserRole.CompanyAdmin, empresa.id);

        await request(app)
            .post("/auth/account/create")
            .set("Authorization", header)
            .send({ companyId: empresa.id, email: "hugo@empresa.pt", role: "employee" })
            .expect(201);

        const user = await users().findOneBy({ email: "hugo@empresa.pt" });

        expect(mailSpy).toHaveBeenCalledTimes(1);
        expect(mailSpy).toHaveBeenCalledWith(
            expect.objectContaining({ name: "ACME", email: "geral@acme.pt" }),
            "hugo@empresa.pt",
            expect.stringContaining(user!.signupToken!),
        );
    });

    it("cria a conta na mesma quando o envio do email falha", async () => {
        const empresa = await criarEmpresa();
        const { header } = await createActor(UserRole.CompanyAdmin, empresa.id);
        mailSpy.mockRejectedValueOnce(new Error("SMTP em baixo"));

        await request(app)
            .post("/auth/account/create")
            .set("Authorization", header)
            .send({ companyId: empresa.id, email: "ines@empresa.pt", role: "employee" })
            .expect(201);

        const user = await users().findOneBy({ email: "ines@empresa.pt" });

        expect(user!.signupToken).toEqual(expect.any(String));
    });

    it("assume o papel de employee quando um company_admin não indica nenhum", async () => {
        const empresa = await criarEmpresa();
        const { header } = await createActor(UserRole.CompanyAdmin, empresa.id);

        await request(app)
            .post("/auth/account/create")
            .set("Authorization", header)
            .send({ companyId: empresa.id, email: "diana@empresa.pt" })
            .expect(201);

        expect(await users().findOneBy({ email: "diana@empresa.pt" })).toMatchObject({
            role: "employee",
        });
    });

    it("devolve 409 quando o email já existe na mesma empresa", async () => {
        const utilizador = await criarUtilizador({ email: "eva@empresa.pt" });
        const { header } = await createActor(UserRole.CompanyAdmin, utilizador.companyId);

        const res = await request(app)
            .post("/auth/account/create")
            .set("Authorization", header)
            .send({ companyId: utilizador.companyId, email: "eva@empresa.pt" });

        expect(res.status).toBe(409);
        expect(await users().countBy({ email: "eva@empresa.pt" })).toBe(1);
    });

    it("aceita o mesmo email em empresas diferentes", async () => {
        const empresaA = await criarEmpresa();
        const empresaB = await criarEmpresa();
        const { header } = await createActor(UserRole.SystemAdmin);

        await request(app)
            .post("/auth/account/create")
            .set("Authorization", header)
            .send({ companyId: empresaA.id, email: "geral@empresa.pt" })
            .expect(201);

        await request(app)
            .post("/auth/account/create")
            .set("Authorization", header)
            .send({ companyId: empresaB.id, email: "geral@empresa.pt" })
            .expect(201);

        expect(await users().countBy({ email: "geral@empresa.pt" })).toBe(2);
    });

    it("devolve 404 quando a empresa indicada não existe", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await request(app)
            .post("/auth/account/create")
            .set("Authorization", header)
            .send({
                companyId: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
                email: "fantasma@empresa.pt",
            });

        expect(res.status).toBe(404);
        expect(await users().countBy({ email: "fantasma@empresa.pt" })).toBe(0);
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
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await request(app)
            .post("/auth/account/create")
            .set("Authorization", header)
            .send(corpo);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ field: campoComErro, message: expect.any(String) }),
            ]),
        );
    });

    it("não grava nada quando o corpo é inválido", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);

        await request(app)
            .post("/auth/account/create")
            .set("Authorization", header)
            .send({ email: "fantasma@empresa.pt" })
            .expect(400);

        expect(await users().countBy({ email: "fantasma@empresa.pt" })).toBe(0);
    });

    it("ignora em silêncio os campos que não conhece", async () => {
        const empresa = await criarEmpresa();
        const { header } = await createActor(UserRole.CompanyAdmin, empresa.id);

        await request(app)
            .post("/auth/account/create")
            .set("Authorization", header)
            .send({ companyId: empresa.id, email: "flavio@empresa.pt", hacker: true })
            .expect(201);

        expect(await users().countBy({ email: "flavio@empresa.pt" })).toBe(1);
    });
});
