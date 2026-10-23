import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { Project } from "../../src/entities/Project.js";
import { ProjectStatus, UserRole } from "../../src/types/enums.js";
import { createActor } from "../helpers/auth.js";
import { criarEmpresa, criarProjeto, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const projetos = () => repo(Project);

const alterar = (id: string, header: string | undefined, corpo: object) => {
    const pedido = request(app).patch(`/projects/${id}`);
    return (header === undefined ? pedido : pedido.set("Authorization", header)).send(corpo);
};

/** Um projeto na empresa de quem vai mexer nele. */
const cenario = async (role = UserRole.CompanyAdmin) => {
    const { user: actor, header } = await createActor(role);
    const projeto = await criarProjeto(actor.companyId, "Portal");
    await projetos().update(projeto.id, {
        clientName: "Câmara",
        startDate: "2026-01-01",
        budget: "1000.00",
    });

    return { actor, header, projeto };
};

describe("PATCH /projects/:id", () => {
    it("muda o estado do projeto", async () => {
        const { header, projeto } = await cenario();

        const res = await alterar(projeto.id, header, { status: "completed" });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Projeto atualizado" });
        expect(res.body.data.status).toBe(ProjectStatus.Completed);
        expect(await projetos().findOneBy({ id: projeto.id })).toMatchObject({
            status: ProjectStatus.Completed,
        });
    });

    it("junta em vez de substituir: o que é omitido fica como está", async () => {
        const { header, projeto } = await cenario();

        const res = await alterar(projeto.id, header, { name: "Portal v2" });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            name: "Portal v2",
            clientName: "Câmara",
            startDate: "2026-01-01",
            budget: "1000.00",
        });
    });

    it("um null explícito limpa o campo", async () => {
        const { header, projeto } = await cenario();

        const res = await alterar(projeto.id, header, { clientName: null, budget: null });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ clientName: null, budget: null });
    });

    it("define e tira o gestor", async () => {
        const { actor, header, projeto } = await cenario();
        const gestor = await criarUtilizador({ companyId: actor.companyId });

        const definir = await alterar(projeto.id, header, { managerId: gestor.id });
        const tirar = await alterar(projeto.id, header, { managerId: null });

        expect(definir.body.data.managerId).toBe(gestor.id);
        expect(tirar.body.data.managerId).toBeNull();
    });

    it("recusa um gestor de outra empresa com o mesmo 404 de um que não existe", async () => {
        const { header, projeto } = await cenario();
        const alheio = await criarUtilizador();

        const foraDeAlcance = await alterar(projeto.id, header, { managerId: alheio.id });
        const inexistente = await alterar(projeto.id, header, { managerId: randomUUID() });

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
    });

    it("recusa um nome que já existe na empresa", async () => {
        const { actor, header, projeto } = await cenario();
        await criarProjeto(actor.companyId, "Outro");

        const res = await alterar(projeto.id, header, { name: "Outro" });

        expect(res.status).toBe(409);
        expect(await projetos().findOneBy({ id: projeto.id })).toMatchObject({ name: "Portal" });
    });

    it("aceita reenviar o nome que o projeto já tem", async () => {
        const { header, projeto } = await cenario();

        const res = await alterar(projeto.id, header, { name: "Portal" });

        expect(res.status).toBe(200);
    });

    it("recusa um endDate anterior ao startDate que está gravado", async () => {
        const { header, projeto } = await cenario();

        const res = await alterar(projeto.id, header, { endDate: "2025-12-31" });

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual([
            { field: "endDate", message: "A data de fim não pode ser anterior à data de início" },
        ]);
    });

    it("aceita datas trocadas quando o startDate também se limpa", async () => {
        const { header, projeto } = await cenario();

        const res = await alterar(projeto.id, header, { startDate: null, endDate: "2025-12-31" });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ startDate: null, endDate: "2025-12-31" });
    });

    it("um system_admin altera um projeto de qualquer empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const outra = await criarEmpresa();
        const projeto = await criarProjeto(outra.id);

        const res = await alterar(projeto.id, header, { status: "on_hold" });

        expect(res.status).toBe(200);
    });

    it("responde o mesmo a um projeto de outra empresa e a um que não existe", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();
        const alheio = await criarProjeto(outra.id);

        const foraDeAlcance = await alterar(alheio.id, header, { status: "cancelled" });
        const inexistente = await alterar(randomUUID(), header, { status: "cancelled" });

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
        expect(await projetos().findOneBy({ id: alheio.id })).toMatchObject({
            status: ProjectStatus.Active,
        });
    });

    it("recusa a um employee alterar um projeto", async () => {
        const { header, projeto } = await cenario(UserRole.Employee);

        const res = await alterar(projeto.id, header, { status: "cancelled" });

        expect(res.status).toBe(403);
    });

    it("devolve 404, e não 500, para um id que não é uuid", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await alterar("nao-e-um-uuid", header, { status: "active" });

        expect(res.status).toBe(404);
    });

    it("devolve 401 sem token", async () => {
        const res = await alterar(randomUUID(), undefined, { status: "active" });

        expect(res.status).toBe(401);
    });

    it.each([
        ["o corpo vazio", {}, undefined],
        ["um estado desconhecido", { status: "arquivado" }, "status"],
        ["o nome vazio", { name: "" }, "name"],
        ["o nome a null", { name: null }, "name"],
        ["um orçamento com 3 casas decimais", { budget: "10.123" }, "budget"],
    ])("devolve 400 com %s", async (_titulo, corpo, field) => {
        const { header, projeto } = await cenario();

        const res = await alterar(projeto.id, header, corpo);

        expect(res.status).toBe(400);
        if (field) {
            expect(res.body.data).toEqual(
                expect.arrayContaining([expect.objectContaining({ field })]),
            );
        }
    });
});
