import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { monthOf } from "../../src/services/finance.js";
import { ExpenseCategory, UserRole } from "../../src/types/enums.js";
import { isoDate } from "../../src/utils/dates.js";
import { authorization, createActor } from "../helpers/auth.js";
import {
    criarAlocacao,
    criarDespesa,
    criarEmpresa,
    criarProjeto,
    criarSalario,
    criarUtilizador,
} from "../helpers/factories.js";

const ler = (projectId: string, header: string) =>
    request(app).get(`/projects/${projectId}/finance`).set("Authorization", header);

const ativo = (companyId: string) =>
    criarUtilizador({ companyId, password: "Password1!", mustChangePassword: false });

/**
 * Uma empresa em Portugal (fator 1,44375). A Ana ganha 1000 e esteve a 50% no
 * projeto em janeiro de 2025: 721,875 de custo em pessoas, 721,88 arredondado.
 * O projeto gastou 300 em software em janeiro e 200 em viagens em fevereiro.
 */
const cenario = async (budget: string | null = "5000.00") => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const gestora = await ativo(admin.companyId);
    const ana = await ativo(admin.companyId);
    const projeto = await criarProjeto(admin.companyId, "Portal", {
        managerId: gestora.id,
        budget,
        startDate: "2025-01-01",
    });

    await criarSalario(ana.id, admin.id, { amount: "1000.00", effectiveFrom: "2025-01-01" });
    await criarAlocacao(ana.id, projeto.id, { allocationPercent: 50, startDate: "2025-01-01", endDate: "2025-01-31" });
    await criarDespesa(admin.companyId, admin.id, {
        projectId: projeto.id,
        amount: "300.00",
        category: ExpenseCategory.Software,
        incurredOn: "2025-01-15",
    });
    await criarDespesa(admin.companyId, admin.id, {
        projectId: projeto.id,
        amount: "200.00",
        category: ExpenseCategory.Travel,
        incurredOn: "2025-02-10",
    });

    return { admin, header, gestora, ana, projeto };
};

describe("GET /projects/:id/finance", () => {
    it("um admin vê as despesas e o custo em pessoas contra o orçamento", async () => {
        const { header, projeto } = await cenario();

        const res = await ler(projeto.id, header);

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            projectId: projeto.id,
            budget: "5000.00",
            includesLabour: true,
            expenses: "500.00",
            labourCost: "721.88",
            spent: "1221.88",
            remaining: "3778.12",
            budgetUsedPercent: 24.4,
        });
        expect(res.body.data.months.slice(0, 2)).toEqual([
            { month: "2025-01", expenses: "300.00", labourCost: "721.88" },
            { month: "2025-02", expenses: "200.00", labourCost: "0.00" },
        ]);
        expect(res.body.data.months.at(-1).month).toBe(monthOf(isoDate()));
        expect(res.body.data.byCategory).toHaveLength(Object.values(ExpenseCategory).length);
        expect(res.body.data.byCategory).toEqual(expect.arrayContaining([
            { category: ExpenseCategory.Software, amount: "300.00" },
            { category: ExpenseCategory.Travel, amount: "200.00" },
            { category: ExpenseCategory.Office, amount: "0.00" },
        ]));
    });

    it("o gestor só vê as despesas: nada que dê o salário de alguém", async () => {
        const { gestora, projeto } = await cenario();

        const res = await ler(projeto.id, authorization(gestora));

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            includesLabour: false,
            expenses: "500.00",
            spent: "500.00",
            remaining: "4500.00",
            budgetUsedPercent: 10,
        });
        expect(res.body.data).not.toHaveProperty("labourCost");
        expect(res.body.data.months[0]).toEqual({ month: "2025-01", expenses: "300.00" });
    });

    it("sem orçamento, não há percentagem nem o que resta", async () => {
        const { header, projeto } = await cenario(null);

        const res = await ler(projeto.id, header);

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ budget: null, remaining: null, budgetUsedPercent: null, spent: "1221.88" });
    });

    it("quem está no projeto, mas não o gere, recebe 403", async () => {
        const { ana, projeto } = await cenario();

        const res = await ler(projeto.id, authorization(ana));

        expect(res.status).toBe(403);
    });

    it("responde o mesmo a um projeto de outra empresa e a um que não existe", async () => {
        const { projeto } = await cenario();
        const { header } = await createActor(UserRole.CompanyAdmin, (await criarEmpresa()).id);

        const foraDeAlcance = await ler(projeto.id, header);
        const inexistente = await ler(randomUUID(), header);

        expect(foraDeAlcance.status).toBe(404);
        expect(foraDeAlcance.body).toEqual(inexistente.body);
    });
});
