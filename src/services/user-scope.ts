import { HttpError } from "../dtos/common/errors-dto.js";
import { requireInReach } from "./company-scope.js";
import type { User } from "../entities/User.js";
import { UserRole } from "../types/enums.js";

type Actor = Pick<User, "id" | "role" | "companyId">;

/** Um system_admin alcança todos; os outros só a sua empresa. */
export function isUserInReach(
    actor: Pick<User, "role" | "companyId">,
    target: Pick<User, "companyId">,
): boolean {
    return actor.role === UserRole.SystemAdmin || target.companyId === actor.companyId;
}

/** O mesmo 404 para um utilizador fora de alcance e para um que não existe. */
export function requireUserInReach(
    actor: Pick<User, "role" | "companyId">,
    target: User | null,
    notFoundMessage: string,
): User {
    return requireInReach(actor, target, notFoundMessage);
}

/** Quem pode escrever sobre esta pessoa: ela própria, ou um admin. */
export function canManageUser(actor: Actor, target: Pick<User, "id" | "companyId">): boolean {
    return isUserInReach(actor, target)
        && (actor.id === target.id || actor.role !== UserRole.Employee);
}

/** 403, não 404: o alvo já passou pelo requireUserInReach. */
export function requireCanManageUser(
    actor: Actor,
    target: Pick<User, "id" | "companyId">,
    forbiddenMessage: string,
): void {
    if (!canManageUser(actor, target)) {
        throw new HttpError(403, forbiddenMessage);
    }
}
