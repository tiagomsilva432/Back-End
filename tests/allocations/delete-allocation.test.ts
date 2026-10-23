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

const apagar = (id: string, header?: string) => {
    const pedido = request(app).delete(`/allocations/${id}`);
    return header === undefined ? pedido : pedido.set("Authorization", header);
};

/** Uma alocação na empresa de quem a vai apagar. */
const cenario = async (role = UserRole.CompanyAdmin) => {
    const { user: actor, header } = await createActor(role);
    const pessoa = await criarUtilizador({ companyId: actor.companyId });
    const projeto = await criarProjeto(actor.companyId);
    const alocacao = await criarAlocacao(pessoa.id, projeto.id);

    return { header, pessoa, projeto, alocacao };
};

describe("DELETE /allocations/:id", () => {
    it("apaga a alocação", async () => {
        const { header, alocacao } = await cenario();

        const res = await apagar(alocacao.id, header);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Alocação apagada" });
        expect(await alocacoes().findOneBy({ id: alocacao.id })).toBeNull();
    });

    it("depois de apagada, o par pode voltar a ter uma alocação aberta", async () => {
        const { header, pessoa, projeto, alocacao } = await cenario();

        await apagar(alocacao.id, header).expect(200);

        const res = await request(app)
            .post("/allocations")
            .set("Authorization", header)
            .send({ userId: pessoa.id, projectId: projeto.id, allocationPercent: 40, startDate: "2025-06-01" });

        expect(res.status).toBe(201);
    });

    it("um system_admin apaga uma alocação de qualquer empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const outra = await criarEmpresa();
        const pessoa = await criarUtilizador({ companyId: outra.id });
        const projeto = await criarProjeto(outra.id);
        const alocacao = await criarAlocacao(pessoa.id, projeto.id);

        const res = await apagar(alocacao.id, header);

        expect(res.status).toBe(200);
    });

    it("responde o mesmo a uma alocação de outra empresa e a uma que não existe", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();
        const pessoa = await criarUtilizador({ companyId: outra.id });
        const projeto = await criarProjeto(outra.id);
        const alheia = await criarAlocacao(pessoa.id, projeto.id);

        const foraDeAlcance = await apagar(alheia.id, header);
        const inexistente = await apagar(randomUUID(), header);

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
        expect(await alocacoes().findOneBy({ id: alheia.id })).not.toBeNull();
    });

    it("recusa a um employee apagar uma alocação", async () => {
        const { header, alocacao } = await cenario(UserRole.Employee);

        const res = await apagar(alocacao.id, header);

        expect(res.status).toBe(403);
        expect(await alocacoes().findOneBy({ id: alocacao.id })).not.toBeNull();
    });

    it("devolve 404, e não 500, para um id que não é uuid", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await apagar("nao-e-um-uuid", header);

        expect(res.status).toBe(404);
    });

    it("devolve 401 sem token", async () => {
        const res = await apagar(randomUUID());

        expect(res.status).toBe(401);
    });
});
