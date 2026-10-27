import { describe, expect, it } from "@jest/globals";
import { crossedThreshold } from "../../src/services/budget-alerts.js";
import {
    budgetUsedPercent,
    employerCostFactor,
    expensesByCategory,
    labourCostByProject,
    monthsBetween,
    projectSpending,
    salaryCostByMonth,
} from "../../src/services/finance.js";
import { renderNotificationMessage } from "../../src/services/notification-catalog.js";
import { ExpenseCategory } from "../../src/types/enums.js";
import { formatCents, toCents } from "../../src/utils/money.js";

const salario = (amount: string, effectiveFrom: string, effectiveTo: string | null = null) =>
    ({ userId: "ana", amount, effectiveFrom, effectiveTo });

const alocacao = (allocationPercent: number, startDate: string, endDate: string | null = null, projectId = "p1") =>
    ({ userId: "ana", projectId, allocationPercent, startDate, endDate });

describe("dinheiro", () => {
    it("passa de string a cêntimos e volta", () => {
        expect(toCents("12.5")).toBe(1250);
        expect(toCents("2150.00")).toBe(215000);
        expect(toCents("7")).toBe(700);
        expect(formatCents(215000)).toBe("2150.00");
        expect(formatCents(123456.5)).toBe("1234.57");
        expect(formatCents(-150)).toBe("-1.50");
        expect(formatCents(0.4)).toBe("0.00");
    });
});

describe("employerCostFactor", () => {
    it("em Portugal são 14 salários em 12 meses, mais a TSU", () => {
        expect(employerCostFactor("PT")).toBeCloseTo(1.44375, 10);
    });

    it("noutro país conta o bruto", () => {
        expect(employerCostFactor("ES")).toBe(1);
    });
});

describe("monthsBetween", () => {
    it("atravessa a passagem de ano", () => {
        expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    });
});

describe("salaryCostByMonth", () => {
    it("um mês inteiro conta o salário todo, vezes o fator", () => {
        const custos = salaryCostByMonth([salario("1000.00", "2025-01-01")], ["2025-01", "2025-02"], 1.5, "2025-12-31");

        expect([...custos]).toEqual([["2025-01", 150000], ["2025-02", 150000]]);
    });

    it("um aumento a meio do mês divide-o pelos dias, e o effectiveTo é exclusivo", () => {
        const custos = salaryCostByMonth(
            [salario("1000.00", "2025-01-01", "2025-03-16"), salario("2000.00", "2025-03-16")],
            ["2025-03"],
            1,
            "2025-12-31",
        );

        // 15 dias a 1000 e 16 a 2000, em 31.
        expect(custos.get("2025-03")).toBe(Math.round((100000 * 15 + 200000 * 16) / 31));
    });

    it("nada conta depois do corte", () => {
        const custos = salaryCostByMonth([salario("3100.00", "2025-01-01")], ["2025-03", "2025-04"], 1, "2025-03-10");

        expect([...custos]).toEqual([["2025-03", 100000], ["2025-04", 0]]);
    });

    it("um salário que ainda não começou não conta", () => {
        const custos = salaryCostByMonth([salario("1000.00", "2025-06-01")], ["2025-05"], 1, "2025-12-31");

        expect(custos.get("2025-05")).toBe(0);
    });
});

describe("labourCostByProject", () => {
    it("conta a percentagem do salário nos dias da alocação, com o endDate incluído", () => {
        const custos = labourCostByProject(
            [salario("3100.00", "2025-01-01")],
            [alocacao(50, "2025-03-11", "2025-03-20")],
            ["2025-03"],
            1,
            "2025-12-31",
        );

        expect(custos.get("p1")?.get("2025-03")).toBe(50000);
    });

    it("sem salário, a alocação não custa nada", () => {
        const custos = labourCostByProject([], [alocacao(100, "2025-01-01")], ["2025-01"], 1, "2025-12-31");

        expect(custos.get("p1")?.get("2025-01")).toBe(0);
    });

    it("separa os projetos, e só conta os dias em que alocação e salário coincidem", () => {
        const custos = labourCostByProject(
            [salario("3000.00", "2025-04-16")],
            [alocacao(100, "2025-04-01", null, "p1"), alocacao(50, "2025-04-01", "2025-04-20", "p2")],
            ["2025-04"],
            1,
            "2025-12-31",
        );

        // Abril tem 30 dias. O salário começa a 16: p1 tem 15 dias a 100%, p2 5 dias a 50%.
        expect(custos.get("p1")?.get("2025-04")).toBe(150000);
        expect(custos.get("p2")?.get("2025-04")).toBe(25000);
    });
});

describe("expensesByCategory", () => {
    it("dá todas as categorias pela ordem do enum, e as pedidas quando se filtra", () => {
        const despesas = [
            { projectId: null, amount: "10.00", category: ExpenseCategory.Travel, incurredOn: "2025-01-01" },
            { projectId: "p1", amount: "5.50", category: ExpenseCategory.Travel, incurredOn: "2025-01-02" },
        ];

        expect(expensesByCategory(despesas).map((total) => total.category)).toEqual(Object.values(ExpenseCategory));
        expect(expensesByCategory(despesas, [ExpenseCategory.Travel])).toEqual([
            { category: ExpenseCategory.Travel, cents: 1550 },
        ]);
    });
});

describe("budgetUsedPercent", () => {
    it("dá uma casa decimal, e null sem orçamento ou com um de zero", () => {
        expect(budgetUsedPercent(80000, "1000.00")).toBe(80);
        expect(budgetUsedPercent(33333, "1000.00")).toBe(33.3);
        expect(budgetUsedPercent(100, null)).toBeNull();
        expect(budgetUsedPercent(100, "0.00")).toBeNull();
    });
});

describe("projectSpending", () => {
    it("vai do primeiro mês com alguma coisa até hoje", () => {
        const gasto = projectSpending(
            { id: "p1", startDate: null },
            [{ projectId: "p1", amount: "200.00", category: ExpenseCategory.Hardware, incurredOn: "2025-02-10" }],
            [alocacao(100, "2025-01-01", "2025-01-31")],
            [salario("1000.00", "2025-01-01")],
            1,
            "2025-03-05",
        );

        expect(gasto.months).toEqual(["2025-01", "2025-02", "2025-03"]);
        expect(gasto.expenses).toBe(20000);
        expect(gasto.labour).toBe(100000);
        expect([...gasto.labourByMonth.values()]).toEqual([100000, 0, 0]);
    });

    it("um projeto que ainda não começou fica só no mês de hoje", () => {
        const gasto = projectSpending({ id: "p1", startDate: "2030-01-01" }, [], [], [], 1, "2025-03-05");

        expect(gasto.months).toEqual(["2025-03"]);
    });
});

describe("crossedThreshold", () => {
    it.each([
        [50, 85, 80],
        [50, 120, 100],
        [85, 99, null],
        [null, 90, 80],
        [90, null, null],
        [100, 150, null],
    ])("de %p para %p dá %p", (before, after, expected) => {
        expect(crossedThreshold(before, after)).toBe(expected);
    });
});

describe("a notificação de orçamento", () => {
    it("diz a percentagem, ou que se esgotou", () => {
        const ref = { projectId: "0193a5f1-8c4e-7a2b-9d16-3f5b7c1e0a42", projectName: "Portal" };

        expect(renderNotificationMessage("project.budget_threshold", { ...ref, threshold: 80 }))
            .toBe("O projeto Portal já gastou 80% do orçamento");
        expect(renderNotificationMessage("project.budget_threshold", { ...ref, threshold: 100 }))
            .toBe("O projeto Portal esgotou o orçamento");
    });
});
