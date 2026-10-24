import { HttpError } from "../dtos/common/errors-dto.js";
import type { Announcement } from "../entities/Announcement.js";
import type { Project } from "../entities/Project.js";
import type { User } from "../entities/User.js";
import { AnnouncementScope, UserRole } from "../types/enums.js";

type Actor = Pick<User, "id" | "role" | "companyId">;
type Scoped = Pick<Announcement, "scope" | "companyId">;
type Windowed = Pick<Announcement, "startsAt" | "endsAt">;
/** Só conta para os avisos de projeto: é o managerId que dá a um employee o direito de publicar. */
type ProjectRef = Pick<Project, "managerId"> | null;

export const isAnnouncementActive = (announcement: Windowed, now: Date = new Date()): boolean =>
    announcement.startsAt <= now && (announcement.endsAt === null || announcement.endsAt > now);

/** Os de sistema estão ao alcance de toda a gente; os outros, da empresa deles. */
const isInReach = (actor: Actor, announcement: Scoped): boolean =>
    announcement.scope === AnnouncementScope.System
    || actor.role === UserRole.SystemAdmin
    || announcement.companyId === actor.companyId;

/**
 * Quem publica, altera e apaga:
 * - sistema: só um system_admin;
 * - empresa: um system_admin, ou um company_admin dessa empresa;
 * - projeto: esses dois, ou o gestor do projeto.
 */
export function canManageAnnouncement(actor: Actor, announcement: Scoped, project: ProjectRef): boolean {
    if (actor.role === UserRole.SystemAdmin) {
        return true;
    }

    if (announcement.scope === AnnouncementScope.System || announcement.companyId !== actor.companyId) {
        return false;
    }

    if (actor.role === UserRole.CompanyAdmin) {
        return true;
    }

    return announcement.scope === AnnouncementScope.Project
        && project !== null
        && project.managerId === actor.id;
}

/**
 * Lê-se o que está ao alcance e ativo. Um agendado ou um que já acabou só o vê
 * quem o gere. Tudo o resto é o mesmo 404 de um aviso que não existe.
 */
export function requireReadableAnnouncement(
    actor: Actor,
    announcement: Announcement | null,
    project: ProjectRef,
    notFoundMessage: string,
): Announcement {
    if (
        !announcement
        || !isInReach(actor, announcement)
        || (!isAnnouncementActive(announcement) && !canManageAnnouncement(actor, announcement, project))
    ) {
        throw new HttpError(404, notFoundMessage);
    }

    return announcement;
}

/** 404 para o que não se pode ler; 403 para o que se lê mas não se gere. */
export function requireManageableAnnouncement(
    actor: Actor,
    announcement: Announcement | null,
    project: ProjectRef,
    notFoundMessage: string,
): Announcement {
    const readable = requireReadableAnnouncement(actor, announcement, project, notFoundMessage);

    if (!canManageAnnouncement(actor, readable, project)) {
        throw new HttpError(403, "Sem permissões para gerir este aviso");
    }

    return readable;
}
