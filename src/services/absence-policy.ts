import { HttpError } from "../dtos/common/errors-dto.js";
import type { AbsenceRequest } from "../entities/AbsenceRequest.js";
import type { User } from "../entities/User.js";
import { AbsenceStatus, AbsenceType, UserRole } from "../types/enums.js";

type Actor = Pick<User, "id" | "role" | "companyId">;
type Owned = Pick<AbsenceRequest, "userId" | "companyId">;

/** O que um colega vê do tipo: as férias são férias, o resto é só "ausente". */
export const ABSENT = "absent";
export type PublicAbsenceType = AbsenceType.Vacation | typeof ABSENT;

export const publicAbsenceType = (type: AbsenceType): PublicAbsenceType =>
    type === AbsenceType.Vacation ? AbsenceType.Vacation : ABSENT;

/** Quem gere as ausências de uma empresa: um system_admin, ou um company_admin dela. */
export const isAbsenceAdminOf = (actor: Actor, companyId: string): boolean =>
    actor.role === UserRole.SystemAdmin
    || (actor.role === UserRole.CompanyAdmin && actor.companyId === companyId);

/**
 * Quem vê o tipo verdadeiro e a nota: a própria pessoa, ou quem gere as
 * ausências da empresa. Uma baixa é um dado de saúde: os colegas não a veem.
 */
export const canSeeAbsenceDetails = (actor: Actor, absence: Owned): boolean =>
    actor.id === absence.userId || isAbsenceAdminOf(actor, absence.companyId);

/**
 * Quem aprova, recusa, ou cancela a qualquer altura. Nunca sobre um pedido seu:
 * o de um company_admin decide-o outro company_admin, ou um system_admin.
 */
export const canDecideAbsence = (actor: Actor, absence: Owned): boolean =>
    actor.id !== absence.userId && isAbsenceAdminOf(actor, absence.companyId);

/** O pedido de outra pessoa, para quem não o pode ver, é o mesmo 404 de um que não existe. */
export function requireReadableAbsence(
    actor: Actor,
    absence: AbsenceRequest | null,
    notFoundMessage: string,
): AbsenceRequest {
    if (!absence || !canSeeAbsenceDetails(actor, absence)) {
        throw new HttpError(404, notFoundMessage);
    }

    return absence;
}

/** 404 para o que não se pode ver; 403 para o próprio pedido, que ninguém decide sozinho. */
export function requireDecidableAbsence(
    actor: Actor,
    absence: AbsenceRequest | null,
    notFoundMessage: string,
): AbsenceRequest {
    const readable = requireReadableAbsence(actor, absence, notFoundMessage);

    if (!canDecideAbsence(actor, readable)) {
        throw new HttpError(403, "Ninguém aprova nem recusa um pedido seu");
    }

    return readable;
}

/**
 * Quem junta ou tira um documento: quem vê o pedido (a pessoa, ou quem gere as
 * ausências da empresa), enquanto ele está ativo. Um recusado ou cancelado já
 * não se justifica: 409, como as outras ações sobre um pedido que acabou.
 */
export function requireAttachableAbsence(
    actor: Actor,
    absence: AbsenceRequest | null,
    notFoundMessage: string,
): AbsenceRequest {
    const readable = requireReadableAbsence(actor, absence, notFoundMessage);

    if (readable.status !== AbsenceStatus.Pending && readable.status !== AbsenceStatus.Approved) {
        throw new HttpError(409, `Este pedido já não está ativo: está ${readable.status}`);
    }

    return readable;
}
