import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { Allocation } from "../../src/entities/Allocation.js";
import { UserRole } from "../../src/types/enums.js";
import { createActor } from "../helpers/auth.js";
import { criarAlocacao, criarEmpresa, criarProjeto, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const alocacoes = () => repo(Allocation);

const alterar = (id: string, header: string | undefined, corpo: object) => {
    const pedido = request(app).patch(`/allocations/${id}`);
    return (header === undefined ? pedido : pedido.set("Authorization", header)).send(corpo);
};

/** Uma alocação aberta na empresa de quem vai mexer nela. */
const cenario = async (role = UserRole.CompanyAdmin) => {
    const { user: actor, header } = await createActor(role);
    const pessoa = await criarUtilizador({ companyId: actor.companyId });
    const projeto = await criarProjeto(actor.companyId);
    const alocacao = await criarAlocacao(pessoa.id, projeto.id, {
        allocationPercent: 50,
        roleOnProject: "Junior",
        startDate: "2026-02-01",
    });

    return { actor, header, pessoa, projeto, alocacao };
};

describe("PATCH /allocations/:id", () => {
    it("fecha a alocação ao indicar o endDate", async () => {
        const { header, alocacao } = await cenario();

        const res = await alterar(alocacao.id, header, { endDate: "2026-06-30" });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Alocação atualizada" });
        expect(res.body.data.endDate).toBe("2026-06-30");
        expect(await alocacoes().findOneBy({ id: alocacao.id })).toMatchObject({
            endDate: "2026-06-30",
        });
    });

    it("uma alocação fechada sai do ?open=true", async () => {
        const { header, projeto, alocacao } = await cenario();

        await alterar(alocacao.id, header, { endDate: "2026-06-30" }).expect(200);

        const res = await request(app)
            .get(`/projects/${projeto.id}/allocations?open=true`)
            .set("Authorization", header);

        expect(res.body.data).toEqual([]);
    });

    it("junta em vez de substituir: o que é omitido fica como está", async () => {
        const { header, alocacao } = await cenario();

        const res = await alterar(alocacao.id, header, { allocationPercent: 80 });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            allocationPercent: 80,
            roleOnProject: "Junior",
            startDate: "2026-02-01",
            endDate: null,
        });
    });

    it("um null explícito limpa o roleOnProject", async () => {
        const { header, alocacao } = await cenario();

        const res = await alterar(alocacao.id, header, { roleOnProject: null });

        expect(res.status).toBe(200);
        expect(res.body.data.roleOnProject).toBeNull();
        expect(await alocacoes().findOneBy({ id: alocacao.id })).toMatchObject({
            roleOnProject: null,
        });
    });

    it("um endDate a null reabre a alocação", async () => {
        const { actor, header } = await cenario();
        // Outra pessoa, para o par não ter já uma alocação aberta.
        const outra = await criarUtilizador({ companyId: actor.companyId });
        const projeto = await criarProjeto(actor.companyId);
        const fechada = await criarAlocacao(outra.id, projeto.id, {
            startDate: "2025-01-01",
            endDate: "2025-06-30",
        });

        const res = await alterar(fechada.id, header, { endDate: null });

        expect(res.status).toBe(200);
        expect(res.body.data.endDate).toBeNull();
        expect(await alocacoes().findOneBy({ id: fechada.id })).toMatchObject({ endDate: null });
    });

    it("recusa reabrir quando o par já tem outra alocação aberta", async () => {
        const { header, pessoa, projeto } = await cenario();
        const fechada = await criarAlocacao(pessoa.id, projeto.id, {
            startDate: "2025-01-01",
            endDate: "2025-06-30",
        });

        const res = await alterar(fechada.id, header, { endDate: null });

        expect(res.status).toBe(409);
        expect(res.body.message).toBe("Este utilizador já tem uma alocação aberta neste projeto");
        expect(await alocacoes().findOneBy({ id: fechada.id })).toMatchObject({
            endDate: "2025-06-30",
        });
    });

    it("altera uma alocação já aberta sem se queixar dela mesma", async () => {
        const { header, alocacao } = await cenario();

        const res = await alterar(alocacao.id, header, { allocationPercent: 90, endDate: null });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ allocationPercent: 90, endDate: null });
    });

    it("recusa um endDate anterior ao startDate que está gravado", async () => {
        const { header, alocacao } = await cenario();

        const res = await alterar(alocacao.id, header, { endDate: "2026-01-01" });

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual([
            { field: "endDate", message: "A data de fim não pode ser anterior à data de início" },
        ]);
        expect(await alocacoes().findOneBy({ id: alocacao.id })).toMatchObject({ endDate: null });
    });

    it("aceita um endDate igual ao startDate", async () => {
        const { header, alocacao } = await cenario();

        const res = await alterar(alocacao.id, header, { endDate: "2026-02-01" });

        expect(res.status).toBe(200);
        expect(res.body.data.endDate).toBe("2026-02-01");
    });

    it("devolve 400 com o corpo vazio", async () => {
        const { header, alocacao } = await cenario();

        const res = await alterar(alocacao.id, header, {});

        expect(res.status).toBe(400);
    });

    it("ignora em silêncio o startDate, que não se altera", async () => {
        const { header, alocacao } = await cenario();

        const res = await alterar(alocacao.id, header, {
            startDate: "2020-01-01",
            allocationPercent: 70,
        });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ startDate: "2026-02-01", allocationPercent: 70 });
    });

    it("um system_admin altera uma alocação de qualquer empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const outra = await criarEmpresa();
        const pessoa = await criarUtilizador({ companyId: outra.id });
        const projeto = await criarProjeto(outra.id);
        const alocacao = await criarAlocacao(pessoa.id, projeto.id);

        const res = await alterar(alocacao.id, header, { allocationPercent: 90 });

        expect(res.status).toBe(200);
    });

    it("responde o mesmo a uma alocação de outra empresa e a uma que não existe", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();
        const pessoa = await criarUtilizador({ companyId: outra.id });
        const projeto = await criarProjeto(outra.id);
        const alheia = await criarAlocacao(pessoa.id, projeto.id);

        const foraDeAlcance = await alterar(alheia.id, header, { allocationPercent: 90 });
        const inexistente = await alterar(randomUUID(), header, { allocationPercent: 90 });

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
        expect(foraDeAlcance.body.message).toBe("Alocação não encontrada");
        expect(await alocacoes().findOneBy({ id: alheia.id })).toMatchObject({
            allocationPercent: 50,
        });
    });

    it("recusa a um employee alterar uma alocação", async () => {
        const { header, alocacao } = await cenario(UserRole.Employee);

        const res = await alterar(alocacao.id, header, { allocationPercent: 90 });

        expect(res.status).toBe(403);
        expect(await alocacoes().findOneBy({ id: alocacao.id })).toMatchObject({
            allocationPercent: 50,
        });
    });

    it("devolve 404, e não 500, para um id que não é uuid", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await alterar("nao-e-um-uuid", header, { allocationPercent: 90 });

        expect(res.status).toBe(404);
    });

    it("devolve 401 sem token", async () => {
        const res = await alterar(randomUUID(), undefined, { allocationPercent: 90 });

        expect(res.status).toBe(401);
    });

    it.each([
        ["allocationPercent a 0", { allocationPercent: 0 }, "allocationPercent"],
        ["allocationPercent a 101", { allocationPercent: 101 }, "allocationPercent"],
        ["endDate com formato português", { endDate: "30/06/2026" }, "endDate"],
        ["roleOnProject vazio", { roleOnProject: "" }, "roleOnProject"],
    ])("devolve 400 com %s", async (_titulo, corpo, field) => {
        const { header, alocacao } = await cenario();

        const res = await alterar(alocacao.id, header, corpo);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field })]),
        );
    });
});
