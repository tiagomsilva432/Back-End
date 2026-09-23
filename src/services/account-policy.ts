import type { CreateAccountRequest } from "../dtos/auth/account-dto.js";
import { HttpError } from "../dtos/common/errors-dto.js";
import type { User } from "../entities/User.js";
import { UserRole } from "../types/enums.js";


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

export function resolveAccountTarget(
    actor: Pick<User, "role" | "companyId">,
    body: CreateAccountRequest,
): AccountTarget {
    const role = body.role ?? CREATABLE_ROLES[actor.role][0];

    if (!role || !canCreateRole(actor.role, role)) {
        throw new HttpError(403, "Sem permissões para criar contas com este role");
    }

    if (actor.role !== UserRole.SystemAdmin) {
        if (body.companyId && body.companyId !== actor.companyId) {
            throw new HttpError(403, "Só pode criar contas na sua empresa");
        }
        return { companyId: actor.companyId, role };
    }

    if (!body.companyId) {
        throw new HttpError(400, "Dados inválidos", "BAD_REQUEST", [
            { field: "companyId", message: "Obrigatório quando quem cria é um system_admin" },
        ]);
    }

    return { companyId: body.companyId, role };
}
