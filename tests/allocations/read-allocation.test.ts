import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { UserRole } from "../../src/types/enums.js";
import { createActor } from "../helpers/auth.js";
import { criarAlocacao, criarEmpresa, criarProjeto, criarUtilizador } from "../helpers/factories.js";

const doProjeto = (id: string, header?: string, query = "") => {
    const pedido = request(app).get(`/projects/${id}/allocations${query}`);
    return header === undefined ? pedido : pedido.set("Authorization", header);
};

const doUtilizador = (id: string, header?: string, query = "") => {
    const pedido = request(app).get(`/users/${id}/allocations${query}`);
    return header === undefined ? pedido : pedido.set("Authorization", header);
};

const carga = (id: string, header?: string) => {
    const pedido = request(app).get(`/users/${id}/allocation-load`);
    return header === undefined ? pedido : pedido.set("Authorization", header);
};

const ontem = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const hoje = () => new Date().toISOString().slice(0, 10);
const amanha = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

describe("GET /projects/:id/allocations", () => {
    it("devolve quem trabalha no projeto", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const projeto = await criarProjeto(gestora.companyId);
        const umA = await criarUtilizador({ companyId: gestora.companyId });
        const umB = await criarUtilizador({ companyId: gestora.companyId });
        await criarAlocacao(umA.id, projeto.id);
        await criarAlocacao(umB.id, projeto.id);

        const res = await doProjeto(projeto.id, header);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Alocações" });
        expect(res.body.data).toHaveLength(2);
    });

    it("com ?open=true deixa de fora as alocações fechadas", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const projeto = await criarProjeto(gestora.companyId);
        const aberta = await criarUtilizador({ companyId: gestora.companyId });
        const fechada = await criarUtilizador({ companyId: gestora.companyId });
        await criarAlocacao(aberta.id, projeto.id);
        await criarAlocacao(fechada.id, projeto.id, { endDate: "2026-03-31" });

        const todas = await doProjeto(projeto.id, header);
        const res = await doProjeto(projeto.id, header, "?open=true");

        expect(todas.body.data).toHaveLength(2);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].userId).toBe(aberta.id);
    });

    it("um employee lê as alocações de um projeto da sua empresa", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);
        const projeto = await criarProjeto(empregado.companyId);
        await criarAlocacao(empregado.id, projeto.id);

        const res = await doProjeto(projeto.id, header);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
    });

    it("responde o mesmo a um projeto de outra empresa e a um que não existe", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();
        const alheio = await criarProjeto(outra.id);

        const foraDeAlcance = await doProjeto(alheio.id, header);
        const inexistente = await doProjeto(randomUUID(), header);

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
        expect(foraDeAlcance.body.message).toBe("Projeto não encontrado");
    });

    it("devolve 404, e não 500, para um id que não é uuid", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await doProjeto("nao-e-um-uuid", header);

        expect(res.status).toBe(404);
    });

    it("devolve 401 sem token", async () => {
        const res = await doProjeto(randomUUID());

        expect(res.status).toBe(401);
    });
});

describe("GET /users/:id/allocations", () => {
    it("devolve os projetos de uma pessoa", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projetoA = await criarProjeto(gestora.companyId);
        const projetoB = await criarProjeto(gestora.companyId);
        await criarAlocacao(pessoa.id, projetoA.id);
        await criarAlocacao(pessoa.id, projetoB.id);

        const res = await doUtilizador(pessoa.id, header);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(2);
    });

    it("com ?open=true deixa de fora as fechadas", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projetoA = await criarProjeto(gestora.companyId);
        const projetoB = await criarProjeto(gestora.companyId);
        await criarAlocacao(pessoa.id, projetoA.id);
        await criarAlocacao(pessoa.id, projetoB.id, { endDate: "2026-03-31" });

        const res = await doUtilizador(pessoa.id, header, "?open=true");

        expect(res.body.data).toHaveLength(1);
    });

    it("devolve uma lista vazia para quem não está alocado", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });

        const res = await doUtilizador(pessoa.id, header);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
    });

    it("responde o mesmo a uma pessoa de outra empresa e a uma que não existe", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();
        const alheia = await criarUtilizador({ companyId: outra.id });

        const foraDeAlcance = await doUtilizador(alheia.id, header);
        const inexistente = await doUtilizador(randomUUID(), header);

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
        expect(foraDeAlcance.body.message).toBe("Utilizador não encontrado");
    });

    it("devolve 400 com um ?open inválido", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });

        const res = await doUtilizador(pessoa.id, header, "?open=talvez");

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: "open" })]),
        );
    });
});

describe("GET /users/:id/allocation-load", () => {
    it("soma as alocações abertas", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projetoA = await criarProjeto(gestora.companyId);
        const projetoB = await criarProjeto(gestora.companyId);
        await criarAlocacao(pessoa.id, projetoA.id, { allocationPercent: 60 });
        await criarAlocacao(pessoa.id, projetoB.id, { allocationPercent: 30 });

        const res = await carga(pessoa.id, header);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Carga de alocação" });
        expect(res.body.data).toEqual({
            userId: pessoa.id,
            totalPercent: 90,
            overAllocated: false,
        });
    });

    it("devolve 0 para quem não está alocado", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });

        const res = await carga(pessoa.id, header);

        expect(res.body.data).toEqual({
            userId: pessoa.id,
            totalPercent: 0,
            overAllocated: false,
        });
    });

    it("não conta uma alocação que terminou ontem", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projeto = await criarProjeto(gestora.companyId);
        await criarAlocacao(pessoa.id, projeto.id, {
            allocationPercent: 70,
            startDate: "2025-01-01",
            endDate: ontem(),
        });

        const res = await carga(pessoa.id, header);

        expect(res.body.data.totalPercent).toBe(0);
    });

    it("conta uma alocação que termina hoje", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projeto = await criarProjeto(gestora.companyId);
        await criarAlocacao(pessoa.id, projeto.id, {
            allocationPercent: 70,
            startDate: "2025-01-01",
            endDate: hoje(),
        });

        const res = await carga(pessoa.id, header);

        expect(res.body.data.totalPercent).toBe(70);
    });

    it("conta uma alocação que termina amanhã", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projeto = await criarProjeto(gestora.companyId);
        await criarAlocacao(pessoa.id, projeto.id, {
            allocationPercent: 70,
            startDate: "2025-01-01",
            endDate: amanha(),
        });

        const res = await carga(pessoa.id, header);

        expect(res.body.data.totalPercent).toBe(70);
    });

    it("não marca sobrecarga exatamente nos 100%", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projeto = await criarProjeto(gestora.companyId);
        await criarAlocacao(pessoa.id, projeto.id, { allocationPercent: 100 });

        const res = await carga(pessoa.id, header);

        expect(res.body.data).toMatchObject({ totalPercent: 100, overAllocated: false });
    });

    it("marca sobrecarga acima dos 100%", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        const pessoa = await criarUtilizador({ companyId: gestora.companyId });
        const projetoA = await criarProjeto(gestora.companyId);
        const projetoB = await criarProjeto(gestora.companyId);
        await criarAlocacao(pessoa.id, projetoA.id, { allocationPercent: 80 });
        await criarAlocacao(pessoa.id, projetoB.id, { allocationPercent: 40 });

        const res = await carga(pessoa.id, header);

        expect(res.body.data).toMatchObject({ totalPercent: 120, overAllocated: true });
    });

    it("responde 404 para uma pessoa de outra empresa", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();
        const alheia = await criarUtilizador({ companyId: outra.id });

        const res = await carga(alheia.id, header);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Utilizador não encontrado");
    });

    it("devolve 404, e não 500, para um id que não é uuid", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await carga("nao-e-um-uuid", header);

        expect(res.status).toBe(404);
    });

    it("devolve 401 sem token", async () => {
        const res = await carga(randomUUID());

        expect(res.status).toBe(401);
    });
});
