import { HttpError } from "../dtos/common/errors-dto.js";
import type { Expense } from "../entities/Expense.js";
import type { Project } from "../entities/Project.js";
import type { User } from "../entities/User.js";
import { UserRole } from "../types/enums.js";

type Actor = Pick<User, "id" | "role" | "companyId">;
type Owned = Pick<Expense, "companyId" | "projectId">;
/** Só conta para as despesas de projeto: é o managerId que dá a um employee o direito de as gerir. */
type ProjectRef = Pick<Project, "managerId"> | null;

/** Um system_admin, ou um company_admin dessa empresa. */
export const isFinanceAdminOf = (actor: Actor, companyId: string): boolean =>
    actor.role === UserRole.SystemAdmin
    || (actor.role === UserRole.CompanyAdmin && actor.companyId === companyId);

/**
 * Quem regista, vê, altera e apaga uma despesa:
 * - da empresa (sem projeto): um system_admin, ou um company_admin dessa empresa;
 * - de um projeto: esses dois, ou o gestor do projeto.
 */
export function canManageExpense(actor: Actor, expense: Owned, project: ProjectRef): boolean {
    if (isFinanceAdminOf(actor, expense.companyId)) {
        return true;
    }

    return expense.projectId !== null
        && actor.companyId === expense.companyId
        && project !== null
        && project.managerId === actor.id;
}

export const canManageProjectExpenses = (actor: Actor, project: Pick<Project, "id" | "companyId" | "managerId">) =>
    canManageExpense(actor, { companyId: project.companyId, projectId: project.id }, project);

/**
 * O custo em pessoas de um projeto é só para os admins. Num projeto pequeno
 * dava o salário de alguém, e um salário um colega nunca vê, nem o gestor.
 */
export const canSeeLabourCost = isFinanceAdminOf;

/** O que está ao alcance (a mesma empresa) mas não é seu responde 403. O resto já foi 404. */
export function requireManageableExpense(actor: Actor, expense: Expense, project: ProjectRef): Expense {
    if (!canManageExpense(actor, expense, project)) {
        throw new HttpError(403, "Sem permissões para gerir esta despesa");
    }

    return expense;
}
