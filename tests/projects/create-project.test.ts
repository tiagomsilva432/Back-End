import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { Project } from "../../src/entities/Project.js";
import { UserRole } from "../../src/types/enums.js";
import { createActor } from "../helpers/auth.js";
import { criarEmpresa, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const projects = () => repo(Project);

const criar = (header: string | undefined, corpo: object) => {
    const pedido = request(app).post("/projects");
    return (header === undefined ? pedido : pedido.set("Authorization", header)).send(corpo);
};

describe("POST /projects", () => {
    it("um company_admin cria o projeto na sua empresa sem indicar companyId", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);

        const res = await criar(header, { name: "  Portal do Cliente  " });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 201, message: "Projeto criado" });
        expect(res.body.data).toMatchObject({
            companyId: gestora.companyId,
            name: "Portal do Cliente",
            status: "planned",
            managerId: null,
            clientName: null,
            budget: null,
        });

        expect(await projects().findOneBy({ name: "Portal do Cliente" })).toMatchObject({
            companyId: gestora.companyId,
            status: "planned",
        });
    });

    it("grava todos os campos opcionais", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const chefe = await criarUtilizador({ companyId: gestora.companyId });

        const res = await criar(header, {
            name: "Migração ERP",
            managerId: chefe.id,
            clientName: "Câmara de Lisboa",
            status: "active",
            startDate: "2026-01-15",
            endDate: "2026-06-30",
            budget: "125000.00",
        });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            managerId: chefe.id,
            clientName: "Câmara de Lisboa",
            status: "active",
            startDate: "2026-01-15",
            endDate: "2026-06-30",
            budget: "125000.00",
        });
    });

    it("aceita o orçamento como número sem perder os cêntimos", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await criar(header, { name: "Com Número", budget: 1234.5 });

        expect(res.status).toBe(201);
        expect(res.body.data.budget).toBe("1234.50");
        expect((await projects().findOneBy({ name: "Com Número" }))!.budget).toBe("1234.50");
    });

    it("um system_admin cria em qualquer empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const empresa = await criarEmpresa();

        const res = await criar(header, { companyId: empresa.id, name: "Projeto Externo" });

        expect(res.status).toBe(201);
        expect(res.body.data.companyId).toBe(empresa.id);
    });

    it("devolve 409 quando o nome já existe na mesma empresa", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        await criar(header, { name: "Repetido" }).expect(201);

        const res = await criar(header, { name: "Repetido" });

        expect(res.status).toBe(409);
        expect(await projects().countBy({ name: "Repetido" })).toBe(1);
    });

    it("aceita o mesmo nome em empresas diferentes", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const empresaA = await criarEmpresa();
        const empresaB = await criarEmpresa();

        await criar(header, { companyId: empresaA.id, name: "Comum" }).expect(201);
        await criar(header, { companyId: empresaB.id, name: "Comum" }).expect(201);

        expect(await projects().countBy({ name: "Comum" })).toBe(2);
    });
});

describe("POST /projects — quem pode criar", () => {
    it("devolve 401 sem token", async () => {
        const res = await criar(undefined, { name: "Anónimo" });

        expect(res.status).toBe(401);
        expect(await projects().countBy({ name: "Anónimo" })).toBe(0);
    });

    it("recusa a um employee criar projetos", async () => {
        const { header } = await createActor(UserRole.Employee);

        const res = await criar(header, { name: "Proibido" });

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ message: "Sem permissões para esta operação" });
        expect(await projects().countBy({ name: "Proibido" })).toBe(0);
    });

    it("recusa a um company_admin criar noutra empresa", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();

        const res = await criar(header, { companyId: outra.id, name: "Infiltrado" });

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ message: "Só pode criar projetos na sua empresa" });
        expect(await projects().countBy({ name: "Infiltrado" })).toBe(0);
    });

    it("exige o companyId a um system_admin", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await criar(header, { name: "Sem Empresa" });

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: "companyId" })]),
        );
    });

    it("devolve 404 quando a empresa não existe", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await criar(header, {
            companyId: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
            name: "Sem Casa",
        });

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ message: "Empresa não encontrada" });
    });
});

describe("POST /projects — o gestor", () => {
    it("devolve 404 para um gestor de outra empresa", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();
        const estranho = await criarUtilizador({ companyId: outra.id });

        const res = await criar(header, { name: "Com Estranho", managerId: estranho.id });

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ message: "Gestor não encontrado nesta empresa" });
        expect(await projects().countBy({ name: "Com Estranho" })).toBe(0);
    });

    it("devolve a mesma resposta para um gestor inexistente", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await criar(header, {
            name: "Com Fantasma",
            managerId: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42",
        });

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ message: "Gestor não encontrado nesta empresa" });
    });
});

describe("POST /projects — validação do corpo", () => {
    it.each([
        ["nome vazio", { name: "   " }, "name"],
        ["nome em falta", {}, "name"],
        ["status fora do enum", { name: "X", status: "a-arrancar" }, "status"],
        ["managerId que não é uuid", { name: "X", managerId: "1" }, "managerId"],
        ["data de início inválida", { name: "X", startDate: "15-01-2026" }, "startDate"],
        ["orçamento com três decimais", { name: "X", budget: "10.005" }, "budget"],
        ["orçamento negativo", { name: "X", budget: "-10" }, "budget"],
        ["fim antes do início", { name: "X", startDate: "2026-06-30", endDate: "2026-01-15" }, "endDate"],
    ])("devolve 400 quando: %s", async (_nome, corpo, campoComErro) => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await criar(header, corpo);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: campoComErro })]),
        );
    });

    it("aceita datas iguais", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        await criar(header, {
            name: "Um Dia",
            startDate: "2026-01-15",
            endDate: "2026-01-15",
        }).expect(201);
    });

    it("autentica antes de validar o corpo", async () => {
        const res = await criar(undefined, { name: "" });

        expect(res.status).toBe(401);
    });
});
