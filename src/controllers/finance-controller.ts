import type { Request, Response } from "express";
import { HttpError } from "../dtos/common/errors-dto.js";
import { HttpResponse } from "../dtos/common/responses-dto.js";
import type {
    FinanceOverviewQuery,
    FinanceOverviewResponse,
    ProjectFinanceResponse,
} from "../dtos/finance/finance-dto.js";
import type { User } from "../entities/User.js";
import { getCurrentActor } from "../middleware/requireRole.js";
import { getAllocationsByCompanyId } from "../repositories/allocation-repo.js";
import { getExpensesBetween, getExpenseTotalsByProject } from "../repositories/expense-repo.js";
import { getProjectById, getProjectsByCompanyId } from "../repositories/project-repo.js";
import { getSalariesByCompanyId } from "../repositories/salary-repo.js";
import { requireCompany } from "../services/company-calendar.js";
import { requireInReach, resolveCompanyScope } from "../services/company-scope.js";
import { canManageProjectExpenses, canSeeLabourCost } from "../services/expense-policy.js";
import {
    budgetUsedPercent,
    type CategoryTotal,
    employerCostFactor,
    expensesByCategory,
    expensesByMonth,
    labourCostByProject,
    lastDayOf,
    monthOf,
    monthsBetween,
    salaryCostByMonth,
} from "../services/finance.js";
import { loadProjectSpending } from "../services/project-finance.js";
import { isoDate } from "../utils/dates.js";
import { formatCents, sumCents, toCents } from "../utils/money.js";
import { uuidParam } from "../utils/params.js";

const PROJECT_NOT_FOUND = "Projeto não encontrado";

const toCategoryAmounts = (totals: CategoryTotal[]) =>
    totals.map(({ category, cents }) => ({ category, amount: formatCents(cents) }));

const series = (salaries: number, projectExpenses: number, overheadExpenses: number) => ({
    salaries: formatCents(salaries),
    projectExpenses: formatCents(projectExpenses),
    overheadExpenses: formatCents(overheadExpenses),
    total: formatCents(salaries + projectExpenses + overheadExpenses),
});

/**
 * O painel de uma empresa: salários, despesas de projeto e despesas da empresa,
 * mês a mês e em separado, para o cliente ligar e desligar cada uma sem voltar
 * a pedir. Só conta o que já se gastou: um mês que ainda não chegou vem a zero.
 */
export const getFinanceOverview = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const query = req.validQuery as FinanceOverviewQuery;

    const company = await requireCompany(resolveCompanyScope(actor, query.companyId, "Só pode ver a sua empresa"));
    const today = isoDate();
    const factor = employerCostFactor(company.country);
    const months = monthsBetween(query.from, query.to);

    const salaries = await getSalariesByCompanyId(company.id);
    const allocations = await getAllocationsByCompanyId(company.id);
    const projects = await getProjectsByCompanyId(company.id);
    const expenseTotals = await getExpenseTotalsByProject(company.id);
    const expenses = await getExpensesBetween(company.id, `${query.from}-01`, lastDayOf(query.to), {
        ...(query.projectIds ? { projectIds: query.projectIds } : {}),
        ...(query.categories ? { categories: query.categories } : {}),
    });

    const salariesByMonth = salaryCostByMonth(salaries, months, factor, today);
    const projectExpenses = expenses.filter((expense) => expense.projectId !== null);
    const projectByMonth = expensesByMonth(projectExpenses, months);
    const overheadByMonth = expensesByMonth(expenses.filter((expense) => expense.projectId === null), months);

    // Uma conta só, de todos os meses: os de sempre para o orçamento, os do intervalo para o gráfico.
    const firstAllocation = allocations.map((allocation) => monthOf(allocation.startDate)).sort()[0];
    const labourMonths = monthsBetween(
        firstAllocation && firstAllocation < query.from ? firstAllocation : query.from,
        query.to > monthOf(today) ? query.to : monthOf(today),
    );
    const labour = labourCostByProject(salaries, allocations, labourMonths, factor, today);
    const inRange = (byMonth: Map<string, number> | undefined) =>
        sumCents(months.map((month) => byMonth?.get(month) ?? 0));

    const totalSalaries = sumCents(salariesByMonth.values());
    const allocatedSalaries = sumCents([...labour.values()].map(inRange));
    const selected = query.projectIds ? new Set(query.projectIds) : null;

    const overview: FinanceOverviewResponse = {
        companyId: company.id,
        from: query.from,
        to: query.to,
        salaryCostFactor: Math.round(factor * 100000) / 100000,
        totals: series(totalSalaries, sumCents(projectByMonth.values()), sumCents(overheadByMonth.values())),
        months: months.map((month) => ({
            month,
            ...series(salariesByMonth.get(month)!, projectByMonth.get(month)!, overheadByMonth.get(month)!),
        })),
        byCategory: toCategoryAmounts(expensesByCategory(expenses, query.categories)),
        byProject: projects
            .filter((project) => !selected || selected.has(project.id))
            .map((project) => {
                const projectLabour = labour.get(project.id);
                const spentToDate = toCents(expenseTotals.get(project.id) ?? "0")
                    + sumCents(projectLabour?.values() ?? []);

                return {
                    projectId: project.id,
                    projectName: project.name,
                    status: project.status,
                    budget: project.budget,
                    expenses: formatCents(sumCents(projectExpenses
                        .filter((expense) => expense.projectId === project.id)
                        .map((expense) => toCents(expense.amount)))),
                    labourCost: formatCents(inRange(projectLabour)),
                    spentToDate: formatCents(spentToDate),
                    budgetUsedPercent: budgetUsedPercent(spentToDate, project.budget),
                };
            }),
        // Acima de 100% de alocação, os projetos levam mais do que o salário: aí não sobra nada.
        unallocatedSalaries: formatCents(Math.max(0, totalSalaries - allocatedSalaries)),
    };

    return new HttpResponse(200, "Finanças da empresa", undefined, overview).send(res);
}

/**
 * O orçamento de um projeto contra o que já se gastou, desde o início. O custo
 * em pessoas é só para os admins: ao gestor, `spent` são só as despesas.
 */
export const getProjectFinance = async (req: Request, res: Response) => {
    const actor: User = getCurrentActor(req);
    const id = uuidParam(req.params.id, PROJECT_NOT_FOUND);

    const project = requireInReach(actor, await getProjectById(id), PROJECT_NOT_FOUND);

    if (!canManageProjectExpenses(actor, project)) {
        throw new HttpError(403, "Sem permissões para ver as finanças deste projeto");
    }

    const withLabour = canSeeLabourCost(actor, project.companyId);
    const spending = await loadProjectSpending(project, withLabour);
    const spent = spending.expenses + spending.labour;

    const finance: ProjectFinanceResponse = {
        projectId: project.id,
        budget: project.budget,
        includesLabour: withLabour,
        expenses: formatCents(spending.expenses),
        ...(withLabour ? { labourCost: formatCents(spending.labour) } : {}),
        spent: formatCents(spent),
        remaining: project.budget === null ? null : formatCents(toCents(project.budget) - spent),
        budgetUsedPercent: budgetUsedPercent(spent, project.budget),
        byCategory: toCategoryAmounts(spending.byCategory),
        months: spending.months.map((month) => ({
            month,
            expenses: formatCents(spending.expensesByMonth.get(month)!),
            ...(withLabour ? { labourCost: formatCents(spending.labourByMonth.get(month)!) } : {}),
        })),
    };

    return new HttpResponse(200, "Finanças do projeto", undefined, finance).send(res);
}
