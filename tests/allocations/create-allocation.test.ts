import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { Allocation } from "../../src/entities/Allocation.js";
import { UserRole } from "../../src/types/enums.js";
import { createActor } from "../helpers/auth.js";
import { criarAlocacao, criarEmpresa, criarProjeto, criarUtilizador } from "../helpers/factories.js";
import { isoDate } from "../../src/utils/dates.js";
import { repo } from "../setup/db.js";

const alocacoes = () => repo(Allocation);

const alocar = (header: string | undefined, corpo: object) => {
    const pedido = request(app).post("/allocations");
    return (header === undefined ? pedido : pedido.set("Authorization", header)).send(corpo);
};

const HOJE = isoDate();

describe("POST /allocations", () => {
    it("aloca uma pessoa a um projeto da sua empresa", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projeto = await criarProjeto(gestora.companyId);

        const res = await alocar(header, {
            userId: pessoa.id,
            projectId: projeto.id,
            allocationPercent: 60,
            roleOnProject: "Backend Developer",
            startDate: "2026-02-01",
        });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 201, message: "Alocação criada" });
        expect(res.body.data).toMatchObject({
            userId: pessoa.id,
            projectId: projeto.id,
            allocationPercent: 60,
            roleOnProject: "Backend Developer",
            startDate: "2026-02-01",
            endDate: null,
        });

        expect(await alocacoes().countBy({ userId: pessoa.id })).toBe(1);
    });

    it("assume a data de hoje quando o startDate não vem", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projeto = await criarProjeto(gestora.companyId);

        const res = await alocar(header, {
            userId: pessoa.id,
            projectId: projeto.id,
            allocationPercent: 50,
        });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ startDate: HOJE, roleOnProject: null });
    });

    it("um system_admin aloca em qualquer empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const outra = await criarEmpresa();
        const pessoa = await criarUtilizador({ companyId: outra.id });
        const projeto = await criarProjeto(outra.id);

        const res = await alocar(header, {
            userId: pessoa.id,
            projectId: projeto.id,
            allocationPercent: 100,
        });

        expect(res.status).toBe(201);
    });

    it("recusa a um employee alocar", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);
        const projeto = await criarProjeto(empregado.companyId);

        const res = await alocar(header, {
            userId: empregado.id,
            projectId: projeto.id,
            allocationPercent: 50,
        });

        expect(res.status).toBe(403);
        expect(await alocacoes().countBy({ userId: empregado.id })).toBe(0);
    });

    it("responde o mesmo a um projeto de outra empresa e a um que não existe", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const outra = await criarEmpresa();
        const alheio = await criarProjeto(outra.id);

        const foraDeAlcance = await alocar(header, {
            userId: pessoa.id,
            projectId: alheio.id,
            allocationPercent: 50,
        });
        const inexistente = await alocar(header, {
            userId: pessoa.id,
            projectId: randomUUID(),
            allocationPercent: 50,
        });

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
        expect(foraDeAlcance.body.message).toBe("Projeto não encontrado");
    });

    it("responde o mesmo a uma pessoa de outra empresa e a uma que não existe", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const projeto = await criarProjeto(gestora.companyId);
        const outra = await criarEmpresa();
        const alheia = await criarUtilizador({ companyId: outra.id });

        const foraDeAlcance = await alocar(header, {
            userId: alheia.id,
            projectId: projeto.id,
            allocationPercent: 50,
        });
        const inexistente = await alocar(header, {
            userId: randomUUID(),
            projectId: projeto.id,
            allocationPercent: 50,
        });

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
        expect(foraDeAlcance.body.message).toBe("Utilizador não encontrado");
    });

    it("um system_admin não junta uma pessoa a um projeto de outra empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const empresaA = await criarEmpresa();
        const empresaB = await criarEmpresa();
        const pessoa = await criarUtilizador({ companyId: empresaA.id });
        const projeto = await criarProjeto(empresaB.id);

        const res = await alocar(header, {
            userId: pessoa.id,
            projectId: projeto.id,
            allocationPercent: 50,
        });

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Utilizador não encontrado");
        expect(await alocacoes().countBy({ userId: pessoa.id })).toBe(0);
    });

    it("recusa uma segunda alocação aberta do mesmo par", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projeto = await criarProjeto(gestora.companyId);
        await criarAlocacao(pessoa.id, projeto.id);

        const res = await alocar(header, {
            userId: pessoa.id,
            projectId: projeto.id,
            allocationPercent: 50,
        });

        expect(res.status).toBe(409);
        expect(res.body.message).toBe("Este utilizador já tem uma alocação aberta neste projeto");
        expect(await alocacoes().countBy({ userId: pessoa.id })).toBe(1);
    });

    it("aceita uma segunda alocação do mesmo par quando já vem fechada", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projeto = await criarProjeto(gestora.companyId);
        await criarAlocacao(pessoa.id, projeto.id);

        const res = await alocar(header, {
            userId: pessoa.id,
            projectId: projeto.id,
            allocationPercent: 30,
            startDate: "2025-01-01",
            endDate: "2025-06-30",
        });

        expect(res.status).toBe(201);
        expect(await alocacoes().countBy({ userId: pessoa.id })).toBe(2);
    });

    it("permite passar dos 100%: a sobrecarga reporta-se, não se recusa", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projetoA = await criarProjeto(gestora.companyId);
        const projetoB = await criarProjeto(gestora.companyId);
        await criarAlocacao(pessoa.id, projetoA.id, { allocationPercent: 80 });

        const res = await alocar(header, {
            userId: pessoa.id,
            projectId: projetoB.id,
            allocationPercent: 80,
        });

        expect(res.status).toBe(201);
    });

    it("aceita a mesma pessoa em dois projetos diferentes", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projetoA = await criarProjeto(gestora.companyId);
        const projetoB = await criarProjeto(gestora.companyId);
        await criarAlocacao(pessoa.id, projetoA.id);

        const res = await alocar(header, {
            userId: pessoa.id,
            projectId: projetoB.id,
            allocationPercent: 40,
        });

        expect(res.status).toBe(201);
    });

    it("devolve 401 sem token", async () => {
        const pessoa = await criarUtilizador();

        const res = await alocar(undefined, {
            userId: pessoa.id,
            projectId: randomUUID(),
            allocationPercent: 50,
        });

        expect(res.status).toBe(401);
    });

    it.each([
        ["allocationPercent a 0", { allocationPercent: 0 }, "allocationPercent"],
        ["allocationPercent a 101", { allocationPercent: 101 }, "allocationPercent"],
        ["allocationPercent decimal", { allocationPercent: 50.5 }, "allocationPercent"],
        ["endDate antes do startDate", { startDate: "2026-06-30", endDate: "2026-01-01" }, "endDate"],
        ["startDate com formato português", { startDate: "01/02/2026" }, "startDate"],
        ["roleOnProject com mais de 100 caracteres", { roleOnProject: "a".repeat(101) }, "roleOnProject"],
    ])("devolve 400 com %s, e não grava nada", async (_titulo, patch, field) => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projeto = await criarProjeto(gestora.companyId);

        const res = await alocar(header, {
            userId: pessoa.id,
            projectId: projeto.id,
            allocationPercent: 50,
            ...patch,
        });

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([{ field, message: expect.any(String) }]),
        );
        expect(await alocacoes().countBy({ userId: pessoa.id })).toBe(0);
    });

    it("devolve 400 quando o allocationPercent não vem", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projeto = await criarProjeto(gestora.companyId);

        const res = await alocar(header, { userId: pessoa.id, projectId: projeto.id });

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: "allocationPercent" })]),
        );
        expect(await alocacoes().countBy({ userId: pessoa.id })).toBe(0);
    });

    it.each([
        ["userId", { userId: "nao-e-uuid" }],
        ["projectId", { projectId: "nao-e-uuid" }],
    ])("devolve 400 quando o %s não é uuid", async (field, patch) => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projeto = await criarProjeto(gestora.companyId);

        const res = await alocar(header, {
            userId: pessoa.id,
            projectId: projeto.id,
            allocationPercent: 50,
            ...patch,
        });

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field })]),
        );
    });
});
