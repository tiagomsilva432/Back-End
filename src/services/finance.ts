import type { Allocation } from "../entities/Allocation.js";
import type { Expense } from "../entities/Expense.js";
import type { Salary } from "../entities/Salary.js";
import { ExpenseCategory } from "../types/enums.js";
import { addDays, daysBetween } from "../utils/dates.js";
import { sumCents, toCents } from "../utils/money.js";

/**
 * As contas das finanças. Tudo aqui é puro, sem base de dados, como os
 * feriados: os salários, as alocações e as despesas chegam já lidos.
 *
 * Os montantes saem em cêntimos. O rateio por dias dá frações, que se somam
 * inteiras e só se arredondam no fim de cada mês: assim o total de um gráfico
 * é sempre a soma dos seus meses.
 */

export type SalaryRow = Pick<Salary, "userId" | "amount" | "effectiveFrom" | "effectiveTo">;
export type AllocationRow = Pick<Allocation, "userId" | "projectId" | "allocationPercent" | "startDate" | "endDate">;
export type ExpenseRow = Pick<Expense, "projectId" | "amount" | "category" | "incurredOn">;

/** Em Portugal pagam-se 14 salários por ano: os 12 meses, o subsídio de férias e o de Natal. */
export const PT_SALARY_PAYMENTS_PER_YEAR = 14;

/** A TSU da entidade patronal, sobre o salário bruto. */
export const PT_EMPLOYER_SOCIAL_SECURITY_RATE = 0.2375;

/**
 * Quanto custa à empresa, por mês, cada euro de salário bruto mensal. Em
 * Portugal, os 14 salários espalhados pelos 12 meses, mais a TSU: 1,44375.
 * Como nos feriados, só Portugal é conhecido: noutro país conta o bruto.
 */
export function employerCostFactor(country: string): number {
    if (country === "PT") {
        return (PT_SALARY_PAYMENTS_PER_YEAR / 12) * (1 + PT_EMPLOYER_SOCIAL_SECURITY_RATE);
    }
    return 1;
}

const pad = (n: number) => String(n).padStart(2, "0");

export const monthOf = (date: string): string => date.slice(0, 7);

const firstDayOf = (month: string): string => `${month}-01`;

function nextMonth(month: string): string {
    const [year, m] = month.split("-").map(Number) as [number, number];
    return m === 12 ? `${year + 1}-01` : `${year}-${pad(m + 1)}`;
}

export const lastDayOf = (month: string): string => addDays(firstDayOf(nextMonth(month)), -1);

export const daysInMonth = (month: string): number =>
    daysBetween(firstDayOf(month), firstDayOf(nextMonth(month)));

/** Os meses de `from` a `to`, os dois incluídos. */
export function monthsBetween(from: string, to: string): string[] {
    const months: string[] = [];
    for (let month = from; month <= to; month = nextMonth(month)) {
        months.push(month);
    }
    return months;
}

/** Mais tarde do que qualquer data: o fim de um salário ou de uma alocação abertos. */
const FOREVER = "9999-12-31";

const later = (a: string, b: string) => (a > b ? a : b);
const earlier = (a: string, b: string) => (a < b ? a : b);

/** Quantos dias de [start, end) caem no mês, sem passar de `upTo` (inclusivo). */
function daysWithin(month: string, start: string, end: string, upTo: string): number {
    const from = later(firstDayOf(month), start);
    const to = earlier(earlier(firstDayOf(nextMonth(month)), end), addDays(upTo, 1));

    return from < to ? daysBetween(from, to) : 0;
}

const zeros = (months: string[]) => new Map(months.map((month) => [month, 0]));

const roundMonths = (costs: Map<string, number>): Map<string, number> =>
    new Map([...costs].map(([month, cents]) => [month, Math.round(cents)]));

/**
 * O custo de cada mês com salários: cada salário conta o bruto × fator, na
 * fração do mês em que esteve em vigor. O effectiveTo é exclusivo: é o dia em
 * que o seguinte começa. Nada conta depois de `upTo`: é o que já se gastou.
 */
export function salaryCostByMonth(
    salaries: SalaryRow[],
    months: string[],
    factor: number,
    upTo: string,
): Map<string, number> {
    const costs = zeros(months);

    for (const month of months) {
        const days = daysInMonth(month);

        for (const salary of salaries) {
            const inForce = daysWithin(month, salary.effectiveFrom, salary.effectiveTo ?? FOREVER, upTo);

            if (inForce > 0) {
                costs.set(month, costs.get(month)! + (toCents(salary.amount) * factor * inForce) / days);
            }
        }
    }

    return roundMonths(costs);
}

/**
 * O que cada projeto custa em pessoas, mês a mês: a parte do salário de cada
 * um que lhe cabe pela percentagem da alocação, nos dias em que a alocação e
 * o salário coincidem. O endDate de uma alocação é inclusivo. É uma parte dos
 * salários, e não um custo a somar-lhes.
 */
export function labourCostByProject(
    salaries: SalaryRow[],
    allocations: AllocationRow[],
    months: string[],
    factor: number,
    upTo: string,
): Map<string, Map<string, number>> {
    const salariesByUser = new Map<string, SalaryRow[]>();

    for (const salary of salaries) {
        salariesByUser.set(salary.userId, [...(salariesByUser.get(salary.userId) ?? []), salary]);
    }

    const costs = new Map<string, Map<string, number>>();

    for (const allocation of allocations) {
        const project = costs.get(allocation.projectId) ?? zeros(months);
        costs.set(allocation.projectId, project);

        const allocationEnd = allocation.endDate ? addDays(allocation.endDate, 1) : FOREVER;

        for (const salary of salariesByUser.get(allocation.userId) ?? []) {
            const start = later(allocation.startDate, salary.effectiveFrom);
            const end = earlier(allocationEnd, salary.effectiveTo ?? FOREVER);

            if (start >= end) {
                continue;
            }

            const monthly = (toCents(salary.amount) * factor * allocation.allocationPercent) / 100;

            for (const month of months) {
                const days = daysWithin(month, start, end, upTo);

                if (days > 0) {
                    project.set(month, project.get(month)! + (monthly * days) / daysInMonth(month));
                }
            }
        }
    }

    return new Map([...costs].map(([projectId, months]) => [projectId, roundMonths(months)]));
}

/** As despesas de cada mês. As que caem fora dos meses pedidos ficam de fora. */
export function expensesByMonth(expenses: ExpenseRow[], months: string[]): Map<string, number> {
    const totals = zeros(months);

    for (const expense of expenses) {
        const month = monthOf(expense.incurredOn);
        const total = totals.get(month);

        if (total !== undefined) {
            totals.set(month, total + toCents(expense.amount));
        }
    }

    return totals;
}

export interface CategoryTotal {
    category: ExpenseCategory;
    cents: number;
}

/** Por categoria, pela ordem do enum e com as que ficam a zero: um gráfico não muda de forma. */
export function expensesByCategory(
    expenses: ExpenseRow[],
    categories: readonly ExpenseCategory[] = Object.values(ExpenseCategory),
): CategoryTotal[] {
    const totals = new Map(categories.map((category) => [category, 0]));

    for (const expense of expenses) {
        const total = totals.get(expense.category);

        if (total !== undefined) {
            totals.set(expense.category, total + toCents(expense.amount));
        }
    }

    return [...totals].map(([category, cents]) => ({ category, cents }));
}

/**
 * Quanto do orçamento já se gastou, em percentagem e sem arredondar. Sem
 * orçamento (ou com um de zero, onde qualquer gasto seria infinito), não há.
 */
export function budgetPercent(spentCents: number, budget: string | null): number | null {
    if (budget === null) {
        return null;
    }

    const budgetCents = toCents(budget);

    return budgetCents > 0 ? (spentCents / budgetCents) * 100 : null;
}

/** O mesmo, com uma casa decimal: é o que a API devolve. */
export function budgetUsedPercent(spentCents: number, budget: string | null): number | null {
    const percent = budgetPercent(spentCents, budget);

    return percent === null ? null : Math.round(percent * 10) / 10;
}

export interface ProjectSpending {
    months: string[];
    expensesByMonth: Map<string, number>;
    labourByMonth: Map<string, number>;
    byCategory: CategoryTotal[];
    expenses: number;
    labour: number;
}

/**
 * O que um projeto gastou desde o início até `today`: as despesas e, quando
 * vêm alocações e salários, as pessoas. Começa no primeiro mês em que houve
 * alguma coisa: o início do projeto, uma alocação ou uma despesa.
 */
export function projectSpending(
    project: { id: string; startDate: string | null },
    expenses: ExpenseRow[],
    allocations: AllocationRow[],
    salaries: SalaryRow[],
    factor: number,
    today: string,
): ProjectSpending {
    const current = monthOf(today);
    const starts = [
        project.startDate,
        ...allocations.map((allocation) => allocation.startDate),
        ...expenses.map((expense) => expense.incurredOn),
    ].filter((date): date is string => date !== null);
    const first = starts.length > 0 ? monthOf(starts.reduce(earlier)) : current;
    const months = monthsBetween(earlier(first, current), current);

    const labourByMonth = labourCostByProject(salaries, allocations, months, factor, today).get(project.id)
        ?? zeros(months);

    return {
        months,
        expensesByMonth: expensesByMonth(expenses, months),
        labourByMonth,
        byCategory: expensesByCategory(expenses),
        expenses: sumCents(expenses.map((expense) => toCents(expense.amount))),
        labour: sumCents(labourByMonth.values()),
    };
}
