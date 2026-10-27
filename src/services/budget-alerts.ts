import type { Project } from "../entities/Project.js";
import type { User } from "../entities/User.js";
import { getUsersByCompanyId, getUsersByRole } from "../repositories/user-repo.js";
import { UserRole, UserStatus } from "../types/enums.js";
import { budgetPercent } from "./finance.js";
import { notifier } from "./notifier.js";
import { loadProjectSpending } from "./project-finance.js";

/** Do mais alto para o mais baixo: só se avisa do mais alto que se passou. */
export const BUDGET_THRESHOLDS = [100, 80] as const;
export type BudgetThreshold = (typeof BUDGET_THRESHOLDS)[number];

/** O limiar mais alto passado a subir de `before` para `after`. Sem orçamento antes, parte-se do zero. */
export function crossedThreshold(before: number | null, after: number | null): BudgetThreshold | null {
    if (after === null) {
        return null;
    }

    const from = before ?? 0;

    return BUDGET_THRESHOLDS.find((threshold) => from < threshold && after >= threshold) ?? null;
}

/**
 * Os company_admins ativos da empresa. Sem nenhum, os system_admins ativos, que
 * são quem lá pode agir. Ao contrário de outros avisos, o admin que fez a
 * escrita não passa a vez aos system_admins: ele já sabe.
 */
async function budgetAdminIds(companyId: string): Promise<string[]> {
    const admins = await getUsersByCompanyId(companyId, { role: UserRole.CompanyAdmin, status: UserStatus.Active });

    if (admins.length > 0) {
        return admins.map((admin) => admin.id);
    }

    return (await getUsersByRole(UserRole.SystemAdmin, { status: UserStatus.Active })).map((admin) => admin.id);
}

interface BudgetChange {
    /** O orçamento de antes, quando foi ele que mudou. */
    previousBudget?: string | null;
    /** Quanto esta escrita mudou as despesas, em cêntimos. */
    expensesDelta?: number;
}

/**
 * Depois de uma escrita que mexe no gasto ou no orçamento de um projeto: se o
 * gasto passou os 80% ou os 100% do orçamento, avisa. Os admins contam com as
 * pessoas; o gestor só com as despesas, que é o que ele vê. Quem fez a escrita
 * não recebe nada.
 *
 * Não há scheduler: o custo em pessoas, que cresce de dia para dia sem escrita
 * nenhuma, não avisa ninguém sozinho. Só a próxima escrita o apanha.
 */
export async function notifyBudgetCrossings(actor: User, project: Project, change: BudgetChange = {}): Promise<void> {
    if (project.budget === null) {
        return;
    }

    const spending = await loadProjectSpending(project, true);
    const previousBudget = change.previousBudget === undefined ? project.budget : change.previousBudget;
    const delta = change.expensesDelta ?? 0;

    const full = crossedThreshold(
        budgetPercent(spending.expenses - delta + spending.labour, previousBudget),
        budgetPercent(spending.expenses + spending.labour, project.budget),
    );
    const expensesOnly = crossedThreshold(
        budgetPercent(spending.expenses - delta, previousBudget),
        budgetPercent(spending.expenses, project.budget),
    );

    if (!full && !expensesOnly) {
        return;
    }

    const admins = await budgetAdminIds(project.companyId);
    const ref = { projectId: project.id, projectName: project.name };

    if (full) {
        await notifier.notify("project.budget_threshold", {
            companyId: project.companyId,
            recipientIds: admins,
            exclude: [actor.id],
            data: { ...ref, threshold: full },
        });
    }

    // Um gestor que também é admin já recebeu o de cima, com as pessoas.
    if (expensesOnly && project.managerId && !admins.includes(project.managerId)) {
        await notifier.notify("project.budget_threshold", {
            companyId: project.companyId,
            recipientIds: [project.managerId],
            exclude: [actor.id],
            data: { ...ref, threshold: expensesOnly },
        });
    }
}
