import { HttpError, invalidData } from "../dtos/common/errors-dto.js";
import type { User } from "../entities/User.js";
import { UserRole } from "../types/enums.js";

/** O mesmo 404 para algo fora de alcance e para algo que não existe. */
export function requireInReach<T extends { companyId: string }>(
    actor: Pick<User, "role" | "companyId">,
    entity: T | null,
    notFoundMessage: string,
): T {
    if (!entity || (actor.role !== UserRole.SystemAdmin && entity.companyId !== actor.companyId)) {
        throw new HttpError(404, notFoundMessage);
    }

    return entity;
}

/**
 * The company a write lands in. A system_admin names it; anyone else is pinned
 * to their own, and the body value is only ever compared, never trusted.
 */
export function resolveCompanyScope(
    actor: Pick<User, "role" | "companyId">,
    companyId: string | undefined,
    forbiddenMessage: string,
): string {
    if (actor.role !== UserRole.SystemAdmin) {
        if (companyId && companyId !== actor.companyId) {
            throw new HttpError(403, forbiddenMessage);
        }
        return actor.companyId;
    }

    if (!companyId) {
        throw invalidData([{ field: "companyId", message: "Obrigatório para o administrador do sistema" }]);
    }

    return companyId;
}
