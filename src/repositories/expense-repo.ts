import { Between, type FindOptionsWhere, In, IsNull, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Expense } from "../entities/Expense.js";
import type { ExpenseCategory } from "../types/enums.js";

export const expenseRepo = AppDataSource.getRepository(Expense);

export async function getExpenseById(id: string): Promise<Expense | null> {
    return await expenseRepo.findOneBy({
        id
    });
}

export interface ExpenseFilter {
    companyId?: string;
    projectId?: string;
    /** Só as da empresa, sem projeto. */
    overhead?: boolean;
    category?: ExpenseCategory;
    from?: string;
    to?: string;
}

/** O intervalo de datas, com as duas pontas opcionais e inclusivas. */
function incurredBetween(from?: string, to?: string) {
    if (from && to) {
        return { incurredOn: Between(from, to) };
    }
    if (from) {
        return { incurredOn: MoreThanOrEqual(from) };
    }
    if (to) {
        return { incurredOn: LessThanOrEqual(to) };
    }
    return {};
}

/** Da mais recente para a mais antiga. O id desempata as do mesmo dia. */
export async function getExpenses(filter: ExpenseFilter): Promise<Expense[]> {
    return await expenseRepo.find({
        where: {
            ...(filter.companyId ? { companyId: filter.companyId } : {}),
            ...(filter.projectId ? { projectId: filter.projectId } : {}),
            ...(filter.overhead ? { projectId: IsNull() } : {}),
            ...(filter.category ? { category: filter.category } : {}),
            ...incurredBetween(filter.from, filter.to)
        },
        order: { incurredOn: "DESC", id: "DESC" }
    });
}

/**
 * As despesas de uma empresa em [from, to], para o painel. `projectIds` só
 * restringe as de projeto: as da empresa entram sempre. `categories` restringe
 * todas.
 */
export async function getExpensesBetween(
    companyId: string,
    from: string,
    to: string,
    filters: { projectIds?: string[]; categories?: ExpenseCategory[] } = {},
): Promise<Expense[]> {
    const base: FindOptionsWhere<Expense> = {
        companyId,
        incurredOn: Between(from, to),
        ...(filters.categories ? { category: In(filters.categories) } : {})
    };

    return await expenseRepo.find({
        where: filters.projectIds
            ? [{ ...base, projectId: IsNull() }, { ...base, projectId: In(filters.projectIds) }]
            : base
    });
}

export async function getExpensesByProjectId(projectId: string): Promise<Expense[]> {
    return await expenseRepo.find({
        where: { projectId },
        order: { incurredOn: "ASC" }
    });
}

/** O total de cada projeto de uma empresa, de sempre. Os projetos sem despesas não aparecem. */
export async function getExpenseTotalsByProject(companyId: string): Promise<Map<string, string>> {
    const rows = await expenseRepo
        .createQueryBuilder("e")
        .select("e.projectId", "projectId")
        .addSelect("SUM(e.amount)", "total")
        .where("e.companyId = :companyId", { companyId })
        .andWhere("e.projectId IS NOT NULL")
        .groupBy("e.projectId")
        .getRawMany<{ projectId: string; total: string }>();

    return new Map(rows.map((row) => [row.projectId, row.total]));
}

export async function createExpense(expense: Expense) {
    return await expenseRepo.save(expense);
}

export async function updateExpense(expense: Expense) {
    return await expenseRepo.save(expense);
}

export async function deleteExpense(id: string) {
    return await expenseRepo.delete({
        id
    });
}
