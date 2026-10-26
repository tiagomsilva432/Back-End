import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { Project } from "../../src/entities/Project.js";
import { ProjectStatus, UserRole } from "../../src/types/enums.js";
import { createActor } from "../helpers/auth.js";
import { criarEmpresa } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const criarProjeto = async (companyId: string, name: string, status = ProjectStatus.Planned) => {
    const projects = repo(Project);
    return projects.save(projects.create({ companyId, name, status }));
};

const listar = (header?: string, query = "") => {
    const pedido = request(app).get(`/projects${query}`);
    return header === undefined ? pedido : pedido.set("Authorization", header);
};

const ver = (id: string, header?: string) => {
    const pedido = request(app).get(`/projects/${id}`);
    return header === undefined ? pedido : pedido.set("Authorization", header);
};

describe("GET /projects", () => {
    it("devolve os projetos da empresa de quem pergunta, por nome", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);
        await criarProjeto(empregado.companyId, "Zulu");
        await criarProjeto(empregado.companyId, "Alfa");

        const res = await listar(header);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Projetos" });
        expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(["Alfa", "Zulu"]);
    });

    it("não mostra os projetos de outra empresa", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);
        const outra = await criarEmpresa();
        await criarProjeto(empregado.companyId, "Nosso");
        await criarProjeto(outra.id, "Alheio");

        const res = await listar(header);

        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].name).toBe("Nosso");
    });

    it("devolve uma lista vazia quando não há projetos", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await listar(header);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
    });

    it("filtra por estado", async () => {
        const { user: gestora, header } = await createActor(UserRole.CompanyAdmin);
        await criarProjeto(gestora.companyId, "A Decorrer", ProjectStatus.Active);
        await criarProjeto(gestora.companyId, "Planeado", ProjectStatus.Planned);

        const res = await listar(header, "?status=active");

        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].name).toBe("A Decorrer");
    });

    it("um system_admin lê a empresa que indicar", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const outra = await criarEmpresa();
        await criarProjeto(outra.id, "De Outra");

        const res = await listar(header, `?companyId=${outra.id}`);

        expect(res.status).toBe(200);
        expect(res.body.data[0].name).toBe("De Outra");
    });

    it("exige o companyId a um system_admin", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await listar(header);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: "companyId" })]),
        );
    });

    it("recusa a um company_admin ler outra empresa", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();

        const res = await listar(header, `?companyId=${outra.id}`);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ message: "Só pode ver a sua empresa" });
    });

    it("devolve 401 sem token", async () => {
        expect((await listar()).status).toBe(401);
    });

    it.each([
        ["status fora do enum", "?status=a-arrancar", "status"],
        ["companyId que não é uuid", "?companyId=1", "companyId"],
    ])("devolve 400 quando: %s", async (_nome, query, campo) => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await listar(header, query);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(
            expect.arrayContaining([expect.objectContaining({ field: campo })]),
        );
    });
});

describe("GET /projects/:id", () => {
    it("devolve o projeto da própria empresa", async () => {
        const { user: empregado, header } = await createActor(UserRole.Employee);
        const projeto = await criarProjeto(empregado.companyId, "Portal");

        const res = await ver(projeto.id, header);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 200, message: "Projeto" });
        expect(res.body.data).toMatchObject({ id: projeto.id, name: "Portal" });
    });

    it("um system_admin vê o projeto de qualquer empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const outra = await criarEmpresa();
        const projeto = await criarProjeto(outra.id, "Alheio");

        expect((await ver(projeto.id, header)).status).toBe(200);
    });

    it("devolve 404 para um projeto de outra empresa", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();
        const projeto = await criarProjeto(outra.id, "Alheio");

        const res = await ver(projeto.id, header);

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ message: "Projeto não encontrado" });
    });

    it("devolve a mesma resposta para um projeto inexistente", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        const res = await ver("0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42", header);

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ message: "Projeto não encontrado" });
    });

    it("devolve 404, e não 500, para um id que não é uuid", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);

        expect((await ver("nao-e-um-uuid", header)).status).toBe(404);
    });

    it("devolve 401 sem token", async () => {
        expect((await ver("0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42")).status).toBe(401);
    });
});
