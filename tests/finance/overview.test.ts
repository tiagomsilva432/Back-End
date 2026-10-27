import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { User } from "../../src/entities/User.js";
import { monthOf } from "../../src/services/finance.js";
import { ExpenseCategory, UserRole } from "../../src/types/enums.js";
import { addDays, isoDate } from "../../src/utils/dates.js";
import { authorization, createActor } from "../helpers/auth.js";
import {
    criarAlocacao,
    criarDespesa,
    criarEmpresa,
    criarProjeto,
    criarSalario,
    criarUtilizador,
} from "../helpers/factories.js";
import { repo } from "../setup/db.js";

const painel = (header: string, query = "") =>
    request(app).get(`/finance/overview${query}`).set("Authorization", header);

/**
 * Uma empresa em Portugal (fator 1,44375). A Ana ganha 1000, o que custa 1443,75
 * por mês, e esteve a 50% no projeto A de janeiro a março de 2025: 721,88 por mês.
 * Em março gastou-se 400 em software no A, 100 em viagens no B e 1500 na renda.
 */
const cenario = async () => {
    const { user: admin, header } = await createActor(UserRole.CompanyAdmin);
    const ana = await criarUtilizador({ companyId: admin.companyId });
    const a = await criarProjeto(admin.companyId, "A", { budget: "10000.00" });
    const b = await criarProjeto(admin.companyId, "B");

    await criarSalario(ana.id, admin.id, { amount: "1000.00", effectiveFrom: "2025-01-01", effectiveTo: "2025-04-01" });
    await criarAlocacao(ana.id, a.id, { allocationPercent: 50, startDate: "2025-01-01", endDate: "2025-03-31" });
    await criarDespesa(admin.companyId, admin.id, {
        projectId: a.id,
        amount: "400.00",
        category: ExpenseCategory.Software,
        incurredOn: "2025-03-05",
    });
    await criarDespesa(admin.companyId, admin.id, {
        projectId: b.id,
        amount: "100.00",
        category: ExpenseCategory.Travel,
        incurredOn: "2025-03-20",
    });
    await criarDespesa(admin.companyId, admin.id, {
        amount: "1500.00",
        category: ExpenseCategory.Office,
        incurredOn: "2025-03-01",
    });
    // Fora do intervalo pedido.
    await criarDespesa(admin.companyId, admin.id, {
        amount: "999.00",
        category: ExpenseCategory.Office,
        incurredOn: "2024-12-31",
    });

    return { admin, header, ana, a, b };
};

const PRIMEIRO_TRIMESTRE = "?from=2025-01&to=2025-03";

describe("GET /finance/overview", () => {
    it("separa salários, despesas de projeto e da empresa, mês a mês", async () => {
        const { admin, header } = await cenario();

        const res = await painel(header, PRIMEIRO_TRIMESTRE);

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            companyId: admin.companyId,
            from: "2025-01",
            to: "2025-03",
            salaryCostFactor: 1.44375,
            totals: {
                salaries: "4331.25",
                projectExpenses: "500.00",
                overheadExpenses: "1500.00",
                total: "6331.25",
            },
        });
        expect(res.body.data.months).toEqual([
            { month: "2025-01", salaries: "1443.75", projectExpenses: "0.00", overheadExpenses: "0.00", total: "1443.75" },
            { month: "2025-02", salaries: "1443.75", projectExpenses: "0.00", overheadExpenses: "0.00", total: "1443.75" },
            {
                month: "2025-03",
                salaries: "1443.75",
                projectExpenses: "500.00",
                overheadExpenses: "1500.00",
                total: "3443.75",
            },
        ]);
    });

    it("o custo em pessoas reparte os salários, e não se soma outra vez", async () => {
        const { header, a, b } = await cenario();

        const res = await painel(header, PRIMEIRO_TRIMESTRE);

        expect(res.body.data.byProject).toEqual([
            {
                projectId: a.id,
                projectName: "A",
                status: "active",
                budget: "10000.00",
                expenses: "400.00",
                labourCost: "2165.64",
                spentToDate: "2565.64",
                budgetUsedPercent: 25.7,
            },
            {
                projectId: b.id,
                projectName: "B",
                status: "active",
                budget: null,
                expenses: "100.00",
                labourCost: "0.00",
                spentToDate: "100.00",
                budgetUsedPercent: null,
            },
        ]);
        expect(res.body.data.unallocatedSalaries).toBe("2165.61");
        expect(res.body.data.totals.total).toBe("6331.25");
    });

    it("agrupa as despesas por categoria", async () => {
        const { header } = await cenario();

        const res = await painel(header, PRIMEIRO_TRIMESTRE);

        expect(res.body.data.byCategory).toEqual([
            { category: ExpenseCategory.Software, amount: "400.00" },
            { category: ExpenseCategory.Hardware, amount: "0.00" },
            { category: ExpenseCategory.Travel, amount: "100.00" },
            { category: ExpenseCategory.Services, amount: "0.00" },
            { category: ExpenseCategory.Office, amount: "1500.00" },
            { category: ExpenseCategory.Other, amount: "0.00" },
        ]);
    });

    it("as categorias filtram as despesas todas, e o spentToDate fica sem filtros", async () => {
        const { header } = await cenario();

        const res = await painel(header, `${PRIMEIRO_TRIMESTRE}&categories=software`);

        expect(res.status).toBe(200);
        expect(res.body.data.totals).toMatchObject({ projectExpenses: "400.00", overheadExpenses: "0.00" });
        expect(res.body.data.byCategory).toEqual([{ category: ExpenseCategory.Software, amount: "400.00" }]);
        expect(res.body.data.byProject[1]).toMatchObject({ expenses: "0.00", spentToDate: "100.00" });
    });

    it("os projetos só filtram as despesas de projeto", async () => {
        const { header, b } = await cenario();

        const res = await painel(header, `${PRIMEIRO_TRIMESTRE}&projectIds=${b.id}`);

        expect(res.status).toBe(200);
        expect(res.body.data.totals).toMatchObject({
            salaries: "4331.25",
            projectExpenses: "100.00",
            overheadExpenses: "1500.00",
        });
        expect(res.body.data.byProject.map((p: { projectId: string }) => p.projectId)).toEqual([b.id]);
    });

    it("conta os salários de quem já saiu", async () => {
        const { header, ana } = await cenario();
        await repo(User).softDelete(ana.id);

        const res = await painel(header, PRIMEIRO_TRIMESTRE);

        expect(res.body.data.totals.salaries).toBe("4331.25");
    });

    it("um mês que ainda não chegou vem a zero", async () => {
        const { admin, header, ana } = await cenario();
        await criarSalario(ana.id, admin.id, { amount: "1000.00", effectiveFrom: "2025-04-01" });
        const daqui = monthOf(isoDate());
        const futuro = monthOf(addDays(isoDate(), 40));

        const res = await painel(header, `?from=${daqui}&to=${futuro}`);

        expect(res.status).toBe(200);
        expect(res.body.data.months.at(-1)).toMatchObject({ month: futuro, salaries: "0.00" });
        expect(res.body.data.months[0].salaries).not.toBe("0.00");
    });

    it("por omissão, o ano corrente", async () => {
        const { header } = await cenario();
        const ano = isoDate().slice(0, 4);

        const res = await painel(header);

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ from: `${ano}-01`, to: `${ano}-12` });
        expect(res.body.data.months).toHaveLength(12);
    });

    it.each([
        ["mais de 24 meses", "?from=2024-01&to=2026-01", "to"],
        ["o fim antes do início", "?from=2025-05&to=2025-01", "to"],
        ["um mês que não existe", "?from=2025-13", "from"],
        ["uma categoria que não existe", "?categories=software,comida", "categories.1"],
        ["um projeto que não é um uuid", "?projectIds=abc", "projectIds.0"],
    ])("devolve 400 com %s", async (_titulo, query, field) => {
        const { header } = await cenario();

        const res = await painel(header, query);

        expect(res.status).toBe(400);
        expect(res.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    });

    it("é só para os admins: um employee, mesmo gestor de um projeto, recebe 403", async () => {
        const { admin } = await cenario();
        const gestora = await criarUtilizador({ companyId: admin.companyId, password: "Password1!", mustChangePassword: false });
        await criarProjeto(admin.companyId, "C", { managerId: gestora.id });

        const res = await painel(authorization(gestora));

        expect(res.status).toBe(403);
    });

    it("um system_admin indica a empresa", async () => {
        const { admin } = await cenario();
        const { header } = await createActor(UserRole.SystemAdmin, (await criarEmpresa()).id);

        const semEmpresa = await painel(header, PRIMEIRO_TRIMESTRE);
        const comEmpresa = await painel(header, `${PRIMEIRO_TRIMESTRE}&companyId=${admin.companyId}`);

        expect(semEmpresa.status).toBe(400);
        expect(comEmpresa.status).toBe(200);
        expect(comEmpresa.body.data.totals.total).toBe("6331.25");
    });
});
