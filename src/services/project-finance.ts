import type { Project } from "../entities/Project.js";
import { getAllocationsByProjectId } from "../repositories/allocation-repo.js";
import { getExpensesByProjectId } from "../repositories/expense-repo.js";
import { getSalariesByUserIds } from "../repositories/salary-repo.js";
import { isoDate } from "../utils/dates.js";
import { requireCompany } from "./company-calendar.js";
import { employerCostFactor, type ProjectSpending, projectSpending } from "./finance.js";

/**
 * O que um projeto gastou até hoje. Sem `withLabour` nem se leem as alocações e
 * os salários: o custo em pessoas fica a zero.
 */
export async function loadProjectSpending(project: Project, withLabour: boolean): Promise<ProjectSpending> {
    const expenses = await getExpensesByProjectId(project.id);

    if (!withLabour) {
        return projectSpending(project, expenses, [], [], 1, isoDate());
    }

    const allocations = await getAllocationsByProjectId(project.id);
    const salaries = await getSalariesByUserIds([...new Set(allocations.map((allocation) => allocation.userId))]);
    const company = await requireCompany(project.companyId);

    return projectSpending(project, expenses, allocations, salaries, employerCostFactor(company.country), isoDate());
}
