import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { Skill } from "../../src/entities/Skill.js";
import { SkillCategory, UserRole } from "../../src/types/enums.js";
import { createActor } from "../helpers/auth.js";
import { criarCompetencia, criarCompetenciaDePessoa, criarEmpresa, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const competencias = () => repo(Skill);

describe("GET /skills", () => {
    it("qualquer conta ativa lê o catálogo semeado", async () => {
        const { header } = await createActor(UserRole.Employee);

        const res = await request(app).get("/skills").set("Authorization", header);

        expect(res.status).toBe(200);
        const nomes = res.body.data.map((s: { name: string }) => s.name);
        expect(nomes).toEqual(expect.arrayContaining(["TypeScript", "React", "Docker"]));
    });

    it("filtra por categoria", async () => {
        const { header } = await createActor(UserRole.Employee);

        const res = await request(app).get("/skills?category=TOOL").set("Authorization", header);

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeGreaterThan(0);
        expect(res.body.data.every((s: { category: string }) => s.category === SkillCategory.Tool)).toBe(true);
    });

    it("devolve 400 com uma categoria desconhecida", async () => {
        const { header } = await createActor(UserRole.Employee);

        const res = await request(app).get("/skills?category=magia").set("Authorization", header);

        expect(res.status).toBe(400);
    });

    it("devolve 401 sem token", async () => {
        const res = await request(app).get("/skills");

        expect(res.status).toBe(401);
    });
});

describe("POST /skills", () => {
    const criar = (header: string, corpo: object) =>
        request(app).post("/skills").set("Authorization", header).send(corpo);

    it("um system_admin acrescenta uma competência", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await criar(header, { name: "Kotlin", category: "language" });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ name: "Kotlin", category: SkillCategory.Language });
        expect(await competencias().findOneBy({ name: "Kotlin" })).not.toBeNull();
    });

    it("a categoria por omissão é other", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await criar(header, { name: "Liderança" });

        expect(res.status).toBe(201);
        expect(res.body.data.category).toBe(SkillCategory.Other);
    });

    it("recusa um nome que já existe, sem distinguir maiúsculas", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await criar(header, { name: "typescript" });

        expect(res.status).toBe(409);
    });

    it.each([UserRole.CompanyAdmin, UserRole.Employee])("recusa a um %s", async (role) => {
        const { header } = await createActor(role);

        const res = await criar(header, { name: "Elixir" });

        expect(res.status).toBe(403);
        expect(await competencias().findOneBy({ name: "Elixir" })).toBeNull();
    });

    it.each([
        ["o nome vazio", { name: "" }],
        ["o nome em falta", { category: "tool" }],
        ["uma categoria desconhecida", { name: "Elixir", category: "magia" }],
    ])("devolve 400 com %s", async (_titulo, corpo) => {
        const { header } = await createActor(UserRole.SystemAdmin);

        const res = await criar(header, corpo);

        expect(res.status).toBe(400);
    });
});

describe("PATCH /skills/:id", () => {
    const alterar = (id: string, header: string, corpo: object) =>
        request(app).patch(`/skills/${id}`).set("Authorization", header).send(corpo);

    it("um system_admin altera o nome e a categoria", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const competencia = await criarCompetencia("Rust");

        const res = await alterar(competencia.id, header, { name: "Rust (lang)", category: "language" });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ name: "Rust (lang)", category: SkillCategory.Language });
    });

    it("junta: a categoria omitida fica como está", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const competencia = await criarCompetencia("Rust", SkillCategory.Language);

        const res = await alterar(competencia.id, header, { name: "Rustlang" });

        expect(res.body.data.category).toBe(SkillCategory.Language);
    });

    it("aceita mudar só as maiúsculas do próprio nome", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const competencia = await criarCompetencia("graphql");

        const res = await alterar(competencia.id, header, { name: "GraphQL" });

        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe("GraphQL");
    });

    it("recusa o nome de outra competência", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const competencia = await criarCompetencia("Rust");

        const res = await alterar(competencia.id, header, { name: "react" });

        expect(res.status).toBe(409);
    });

    it("devolve 404 a uma competência que não existe, e a um id que não é uuid", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);

        expect((await alterar(randomUUID(), header, { name: "X" })).status).toBe(404);
        expect((await alterar("nao-e-um-uuid", header, { name: "X" })).status).toBe(404);
    });

    it("recusa a um company_admin", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const competencia = await criarCompetencia("Rust");

        const res = await alterar(competencia.id, header, { name: "Ferrugem" });

        expect(res.status).toBe(403);
    });

    it("devolve 400 com o corpo vazio", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const competencia = await criarCompetencia();

        const res = await alterar(competencia.id, header, {});

        expect(res.status).toBe(400);
    });
});

describe("GET /skills/:id/users", () => {
    const listar = (id: string, header: string, query = "") =>
        request(app).get(`/skills/${id}/users${query}`).set("Authorization", header);

    it("só mostra as pessoas da empresa de quem pergunta, da mais proficiente para a menos", async () => {
        const { user: actor, header } = await createActor(UserRole.Employee);
        const competencia = await criarCompetencia();
        const junior = await criarUtilizador({ companyId: actor.companyId });
        const senior = await criarUtilizador({ companyId: actor.companyId });
        const semNivel = await criarUtilizador({ companyId: actor.companyId });
        const alheio = await criarUtilizador();
        await criarCompetenciaDePessoa(junior.id, competencia.id, { proficiency: 2 });
        await criarCompetenciaDePessoa(senior.id, competencia.id, { proficiency: 5, yearsExperience: "8.0" });
        await criarCompetenciaDePessoa(semNivel.id, competencia.id);
        await criarCompetenciaDePessoa(alheio.id, competencia.id, { proficiency: 5 });

        const res = await listar(competencia.id, header);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([
            { userId: senior.id, proficiency: 5, yearsExperience: "8.0" },
            { userId: junior.id, proficiency: 2, yearsExperience: null },
            { userId: semNivel.id, proficiency: null, yearsExperience: null },
        ]);
    });

    it("um system_admin indica a empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const outra = await criarEmpresa();
        const pessoa = await criarUtilizador({ companyId: outra.id });
        const competencia = await criarCompetencia();
        await criarCompetenciaDePessoa(pessoa.id, competencia.id, { proficiency: 3 });

        const res = await listar(competencia.id, header, `?companyId=${outra.id}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([{ userId: pessoa.id, proficiency: 3, yearsExperience: null }]);
    });

    it("recusa a quem não é system_admin pedir outra empresa", async () => {
        const { header } = await createActor(UserRole.CompanyAdmin);
        const outra = await criarEmpresa();
        const competencia = await criarCompetencia();

        const res = await listar(competencia.id, header, `?companyId=${outra.id}`);

        expect(res.status).toBe(403);
    });

    it("devolve 404 a uma competência que não existe", async () => {
        const { header } = await createActor(UserRole.Employee);

        const res = await listar(randomUUID(), header);

        expect(res.status).toBe(404);
    });
});
