import type { CreateAccountRequest } from "../dtos/auth/account-dto.js";
import { HttpError } from "../dtos/common/errors-dto.js";
import type { User } from "../entities/User.js";
import { UserRole } from "../types/enums.js";
import { resolveCompanyScope } from "./company-scope.js";

/**
 * Who may create whom. Anything not listed here is denied, and the first role
 * of each list is what a request that omits `role` gets.
 */
const CREATABLE_ROLES: Record<UserRole, readonly UserRole[]> = {
    [UserRole.SystemAdmin]: [UserRole.CompanyAdmin],
    [UserRole.CompanyAdmin]: [UserRole.Employee],
    [UserRole.Employee]: [],
};

export const rolesCreatableBy = (actor: UserRole): readonly UserRole[] => CREATABLE_ROLES[actor];

export const canCreateRole = (actor: UserRole, target: UserRole): boolean =>
    CREATABLE_ROLES[actor].includes(target);

export interface AccountTarget {
    companyId: string;
    role: UserRole;
}

/**
 * Decides the company and role of the account being created. A company_admin's
 * companyId always comes from the actor, never from the request body.
 */
export function resolveAccountTarget(
    actor: Pick<User, "role" | "companyId">,
    body: CreateAccountRequest,
): AccountTarget {
    const role = body.role ?? CREATABLE_ROLES[actor.role][0];

    if (!role || !canCreateRole(actor.role, role)) {
        throw new HttpError(403, "Sem permissões para criar contas com este papel");
    }

    const companyId = resolveCompanyScope(
        actor,
        body.companyId,
        "Só pode criar contas na sua empresa",
    );

    return { companyId, role };
}
