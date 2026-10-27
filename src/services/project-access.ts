import { HttpError } from "../dtos/common/errors-dto.js";
import type { Project } from "../entities/Project.js";
import type { User } from "../entities/User.js";
import { getInvolvedUserIdsByProjectId } from "../repositories/allocation-repo.js";
import { getUsersByCompanyId } from "../repositories/user-repo.js";
import { UserRole, UserStatus } from "../types/enums.js";

type Actor = Pick<User, "id" | "role" | "companyId">;
type ProjectRef = Pick<Project, "id" | "companyId" | "managerId">;

/** Um system_admin, um company_admin da empresa do projeto, ou o gestor dele. */
export const canManageProject = (actor: Actor, project: ProjectRef): boolean =>
    actor.role === UserRole.SystemAdmin
    || (actor.role === UserRole.CompanyAdmin && actor.companyId === project.companyId)
    || project.managerId === actor.id;

/**
 * Quem está no projeto: quem o gere (acima), e quem lá tem uma alocação que
 * ainda não terminou.
 */
export async function isProjectMember(actor: Actor, project: ProjectRef): Promise<boolean> {
    if (canManageProject(actor, project)) {
        return true;
    }

    return (await getInvolvedUserIdsByProjectId(project.id)).includes(actor.id);
}

/**
 * Os recursos, o chat e o quadro são de quem está no projeto. O projeto já
 * passou pelo requireInReach, por isso aqui um "não" é 403, e não o 404 de um
 * projeto que não se vê.
 */
export async function requireProjectMember(actor: Actor, project: ProjectRef, forbiddenMessage: string): Promise<void> {
    if (!(await isProjectMember(actor, project))) {
        throw new HttpError(403, forbiddenMessage);
    }
}

/**
 * A quem se manda em direto o que muda no chat ou no quadro: quem está no
 * projeto, o gestor, e os company_admins ativos da empresa. Um system_admin
 * fica de fora: é de todas as empresas, e recebia tudo.
 */
export async function projectAudienceIds(project: ProjectRef): Promise<Array<string | null>> {
    const involved = await getInvolvedUserIdsByProjectId(project.id);
    const admins = await getUsersByCompanyId(project.companyId, {
        role: UserRole.CompanyAdmin,
        status: UserStatus.Active,
    });

    return [...involved, project.managerId, ...admins.map((admin) => admin.id)];
}
