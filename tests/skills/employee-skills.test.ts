import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { EmployeeSkill } from "../../src/entities/EmployeeSkill.js";
import { Skill } from "../../src/entities/Skill.js";
import { SkillCategory, UserRole, UserStatus } from "../../src/types/enums.js";
import { createActor } from "../helpers/auth.js";
import { criarCompetencia, criarCompetenciaDePessoa, criarEmpresa, criarUtilizador } from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const competenciasDePessoas = () => repo(EmployeeSkill);

const atribuir = (userId: string, skillId: string, header: string | undefined, corpo: object) => {
    const pedido = request(app).put(`/users/${userId}/skills/${skillId}`);
    return (header === undefined ? pedido : pedido.set("Authorization", header)).send(corpo);
};

const tirar = (userId: string, skillId: string, header: string) =>
    request(app).delete(`/users/${userId}/skills/${skillId}`).set("Authorization", header);

/** Um employee na empresa de um company_admin, e uma competência do catálogo. */
const cenario = async (role = UserRole.CompanyAdmin) => {
    const { user: actor, header } = await createActor(role);
    const pessoa = await criarUtilizador({ companyId: actor.companyId });
    const competencia = await criarCompetencia("Kotlin", SkillCategory.Language);

    return { actor, header, pessoa, competencia };
};

describe("PUT /users/:id/skills/:skillId", () => {
    it("um company_admin atribui uma competência a um employee", async () => {
        const { header, pessoa, competencia } = await cenario();

        const res = await atribuir(pessoa.id, competencia.id, header, { proficiency: 4, yearsExperience: 3.5 });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 201, message: "Competência atribuída" });
        expect(res.body.data).toEqual({
            userId: pessoa.id,
            skillId: competencia.id,
            name: "Kotlin",
            category: SkillCategory.Language,
            proficiency: 4,
            yearsExperience: "3.5",
        });
    });

    it("responde 200 ao alterar, e substitui: o campo omitido fica a null", async () => {
        const { header, pessoa, competencia } = await cenario();
        await criarCompetenciaDePessoa(pessoa.id, competencia.id, { proficiency: 2, yearsExperience: "1.0" });

        const res = await atribuir(pessoa.id, competencia.id, header, { proficiency: 3 });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ proficiency: 3, yearsExperience: null });
        expect(await competenciasDePessoas().findOneBy({ userId: pessoa.id, skillId: competencia.id }))
            .toMatchObject({ proficiency: 3, yearsExperience: null });
    });

    it("aceita o corpo vazio: a competência fica sem nível", async () => {
        const { header, pessoa, competencia } = await cenario();

        const res = await atribuir(pessoa.id, competencia.id, header, {});

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ proficiency: null, yearsExperience: null });
    });

    it("normaliza os anos inteiros para uma casa decimal", async () => {
        const { header, pessoa, competencia } = await cenario();

        const res = await atribuir(pessoa.id, competencia.id, header, { yearsExperience: "4" });

        expect(res.body.data.yearsExperience).toBe("4.0");
    });

    it("ninguém altera as suas próprias competências, nem um system_admin", async () => {
        const { user: actor, header } = await createActor(UserRole.SystemAdmin);
        const competencia = await criarCompetencia();

        const res = await atribuir(actor.id, competencia.id, header, { proficiency: 5 });

        expect(res.status).toBe(403);
        expect(await competenciasDePessoas().findOneBy({ userId: actor.id })).toBeNull();
    });

    it("um company_admin não altera as de outro company_admin", async () => {
        const { actor, header, competencia } = await cenario();
        const colega = await criarUtilizador({ companyId: actor.companyId, role: UserRole.CompanyAdmin });

        const res = await atribuir(colega.id, competencia.id, header, { proficiency: 5 });

        expect(res.status).toBe(403);
    });

    it("recusa a um employee, mesmo sobre si próprio", async () => {
        const { actor, header, competencia } = await cenario(UserRole.Employee);

        const res = await atribuir(actor.id, competencia.id, header, { proficiency: 5 });

        expect(res.status).toBe(403);
    });

    it("um system_admin atribui numa pessoa de qualquer empresa", async () => {
        const { header } = await createActor(UserRole.SystemAdmin);
        const pessoa = await criarUtilizador({ companyId: (await criarEmpresa()).id });
        const competencia = await criarCompetencia();

        const res = await atribuir(pessoa.id, competencia.id, header, { proficiency: 1 });

        expect(res.status).toBe(201);
    });

    it("responde o mesmo a uma pessoa de outra empresa e a uma que não existe", async () => {
        const { header, competencia } = await cenario();
        const alheia = await criarUtilizador();

        const foraDeAlcance = await atribuir(alheia.id, competencia.id, header, { proficiency: 3 });
        const inexistente = await atribuir(randomUUID(), competencia.id, header, { proficiency: 3 });

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
    });

    it("devolve 404 a uma competência que não existe", async () => {
        const { header, pessoa } = await cenario();

        const res = await atribuir(pessoa.id, randomUUID(), header, { proficiency: 3 });

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Competência não encontrada");
    });

    it("devolve 401 sem token", async () => {
        const res = await atribuir(randomUUID(), randomUUID(), undefined, {});

        expect(res.status).toBe(401);
    });

    it.each([
        ["proficiency a 0", { proficiency: 0 }, "proficiency"],
        ["proficiency a 6", { proficiency: 6 }, "proficiency"],
        ["proficiency decimal", { proficiency: 2.5 }, "proficiency"],
        ["anos negativos", { yearsExperience: -1 }, "yearsExperience"],
        ["anos com 2 casas decimais", { yearsExperience: "1.25" }, "yearsExperience"],
        ["anos acima de 999.9", { yearsExperience: 1000 }, "yearsExperience"],
    ])("devolve 400 com %s", async (_titulo, corpo, field) => {
        const { header, pessoa, competencia } = await cenario();

        const res = await atribuir(pessoa.id, competencia.id, header, corpo);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    });
});

describe("DELETE /users/:id/skills/:skillId", () => {
    it("tira a competência à pessoa, e o catálogo fica igual", async () => {
        const { header, pessoa, competencia } = await cenario();
        await criarCompetenciaDePessoa(pessoa.id, competencia.id, { proficiency: 3 });

        const res = await tirar(pessoa.id, competencia.id, header);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Competência removida");
        expect(await competenciasDePessoas().findOneBy({ userId: pessoa.id })).toBeNull();
        expect(await repo(Skill).findOneBy({ id: competencia.id })).not.toBeNull();
    });

    it("devolve 404 quando a pessoa não tem a competência", async () => {
        const { header, pessoa, competencia } = await cenario();

        const res = await tirar(pessoa.id, competencia.id, header);

        expect(res.status).toBe(404);
    });

    it("recusa a um employee", async () => {
        const { actor, header, competencia } = await cenario(UserRole.Employee);
        await criarCompetenciaDePessoa(actor.id, competencia.id);

        const res = await tirar(actor.id, competencia.id, header);

        expect(res.status).toBe(403);
        expect(await competenciasDePessoas().findOneBy({ userId: actor.id })).not.toBeNull();
    });
});

describe("GET /users/:id/skills", () => {
    it("qualquer conta ativa da empresa lê as competências de um colega", async () => {
        const { user: actor, header } = await createActor(UserRole.Employee);
        const colega = await criarUtilizador({ companyId: actor.companyId, status: UserStatus.Active });
        const kotlin = await criarCompetencia("Kotlin", SkillCategory.Language);
        const scrum = await criarCompetencia("Scrum", SkillCategory.Other);
        await criarCompetenciaDePessoa(colega.id, scrum.id, { proficiency: 2 });
        await criarCompetenciaDePessoa(colega.id, kotlin.id, { proficiency: 4, yearsExperience: "2.0" });

        const res = await request(app).get(`/users/${colega.id}/skills`).set("Authorization", header);

        expect(res.status).toBe(200);
        expect(res.body.data.map((s: { name: string }) => s.name)).toEqual(["Kotlin", "Scrum"]);
        expect(res.body.data[0]).toMatchObject({ proficiency: 4, yearsExperience: "2.0" });
    });

    it("devolve uma lista vazia a quem não tem competências", async () => {
        const { user: actor, header } = await createActor(UserRole.Employee);

        const res = await request(app).get(`/users/${actor.id}/skills`).set("Authorization", header);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
    });

    it("devolve 404 a uma pessoa de outra empresa", async () => {
        const { header } = await createActor(UserRole.Employee);
        const alheia = await criarUtilizador();

        const res = await request(app).get(`/users/${alheia.id}/skills`).set("Authorization", header);

        expect(res.status).toBe(404);
    });
});
