import { HttpError } from "../dtos/common/errors-dto.js";
import type { User } from "../entities/User.js";
import { UserRole } from "../types/enums.js";

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
        throw new HttpError(400, "Dados inválidos", "BAD_REQUEST", [
            { field: "companyId", message: "Obrigatório quando quem cria é um system_admin" },
        ]);
    }

    return companyId;
}
