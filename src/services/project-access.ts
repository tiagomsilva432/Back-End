import { HttpError } from "../dtos/common/errors-dto.js";
import type { Project } from "../entities/Project.js";
import type { User } from "../entities/User.js";
import { getInvolvedUserIdsByProjectId } from "../repositories/allocation-repo.js";
import { UserRole } from "../types/enums.js";

type Actor = Pick<User, "id" | "role" | "companyId">;
type ProjectRef = Pick<Project, "id" | "companyId" | "managerId">;

/** Um system_admin, um company_admin da empresa do projeto, ou o gestor dele. */
export const canManageProject = (actor: Actor, project: ProjectRef): boolean =>
    actor.role === UserRole.SystemAdmin
    || (actor.role === UserRole.CompanyAdmin && actor.companyId === project.companyId)
    || project.managerId === actor.id;

/**
 * Os recursos e o chat são de quem está no projeto: quem o gere, e quem lá tem
 * uma alocação que ainda não terminou. O projeto já passou pelo requireInReach,
 * por isso aqui um "não" é 403, e não o 404 de um projeto que não se vê.
 */
export async function requireProjectMember(actor: Actor, project: ProjectRef, forbiddenMessage: string): Promise<void> {
    if (canManageProject(actor, project)) {
        return;
    }

    const involved = await getInvolvedUserIdsByProjectId(project.id);

    if (!involved.includes(actor.id)) {
        throw new HttpError(403, forbiddenMessage);
    }
}
