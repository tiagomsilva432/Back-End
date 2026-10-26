import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { User } from "../../src/entities/User.js";
import { UserRole, UserStatus } from "../../src/types/enums.js";
import { authorization, createActor, ACTOR_PASSWORD } from "../helpers/auth.js";
import { criarEmpresa, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const users = () => repo(User);

const criar = (header: string | undefined, corpo: object) => {
    const pedido = request(app).post("/auth/account/create");
    return (header === undefined ? pedido : pedido.set("Authorization", header)).send(corpo);
};

describe("POST /auth/account/create — quem pode criar contas", () => {
    it("devolve 401 sem token", async () => {
        const res = await criar(undefined, { email: "anonima@empresa.pt" });

        expect(res.status).toBe(401);
        expect(await users().countBy({ email: "anonima@empresa.pt" })).toBe(0);
    });

    it("devolve 401 para um token de um utilizador que já não existe", async () => {
        const header = authorization({
            id: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
            companyId: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
            role: UserRole.SystemAdmin,
        });

        const res = await criar(header, { email: "fantasma@empresa.pt" });

        expect(res.status).toBe(401);
    });

    it.each([
        ["suspensa", { status: UserStatus.Suspended }],
        ["terminada", { status: UserStatus.Terminated }],
        ["com troca de password pendente", { mustChangePassword: true }],
    ])("devolve 403 para um company_admin de conta %s", async (_nome, opcoes) => {
        const admin = await criarUtilizador({
            role: UserRole.CompanyAdmin,
            password: ACTOR_PASSWORD,
            ...opcoes,
        });

        const res = await criar(authorization(admin), { email: "nova@empresa.pt" });

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ status: 403, message: "Conta não está ativa" });
        expect(await users().countBy({ email: "nova@empresa.pt" })).toBe(0);
    });

    it("recusa a um employee criar seja quem for", async () => {
        const { header } = await createActor(UserRole.Employee);

        const res = await criar(header, { email: "colega@empresa.pt", role: "employee" });

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ message: "Sem permissões para esta operação" });
        expect(await users().countBy({ email: "colega@empresa.pt" })).toBe(0);
    });
});

describe("POST /auth/account/create — um company_admin", () => {
    it("cria um employee na sua empresa sem indicar companyId", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);

        const res = await criar(header, { email: "nova@empresa.pt" });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            companyId: gestora.companyId,
            email: "nova@empresa.pt",
            role: "employee",
            status: "invited",
        });
    });

    it("aceita o companyId da própria empresa", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);

        const res = await criar(header, {
            companyId: gestora.companyId,
            email: "outra@empresa.pt",
            role: "employee",
        });

        expect(res.status).toBe(201);
    });

    it("recusa criar contas noutra empresa", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();

        const res = await criar(header, {
            companyId: outra.id,
            email: "infiltrado@empresa.pt",
            role: "employee",
        });

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({
            message: "Só pode criar contas na sua empresa",
            code: "FORBIDDEN",
        });
        expect(await users().countBy({ email: "infiltrado@empresa.pt" })).toBe(0);
    });

    it.each([["company_admin"], ["system_admin"]])(
        "recusa criar um %s",
        async (role) => {
            const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);

            const res = await criar(header, {
                companyId: gestora.companyId,
                email: "promovido@empresa.pt",
                role,
            });

            expect(res.status).toBe(403);
            expect(await users().countBy({ email: "promovido@empresa.pt" })).toBe(0);
        },
    );
});

describe("POST /auth/account/create — um system_admin", () => {
    it("assume company_admin quando não indica papel", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const empresa = await criarEmpresa();

        const res = await criar(header, { companyId: empresa.id, email: "chefe@empresa.pt" });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            companyId: empresa.id,
            role: "company_admin",
        });
    });

    it.each([["employee"], ["system_admin"]])("recusa criar um %s", async (role) => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const empresa = await criarEmpresa();

        const res = await criar(header, {
            companyId: empresa.id,
            email: "indevido@empresa.pt",
            role,
        });

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({
            message: "Sem permissões para criar contas com este papel",
        });
        expect(await users().countBy({ email: "indevido@empresa.pt" })).toBe(0);
    });

    it("exige o companyId", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await criar(header, { email: "sem-empresa@empresa.pt", role: "company_admin" });

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: "companyId" })]),
        );
        expect(await users().countBy({ email: "sem-empresa@empresa.pt" })).toBe(0);
    });
});
