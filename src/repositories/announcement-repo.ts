import { Brackets } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Announcement } from "../entities/Announcement.js";
import { AnnouncementScope } from "../types/enums.js";

export const announcementRepo = AppDataSource.getRepository(Announcement);

/** Os fixados primeiro, depois do mais recente. O id desempata o que entrou no mesmo instante. */
const ORDER = [
    ["a.pinned", "DESC"],
    ["a.startsAt", "DESC"],
    ["a.id", "DESC"],
] as const;

export async function getAnnouncementById(id: string): Promise<Announcement | null> {
    return await announcementRepo.findOneBy({
        id
    });
}

/**
 * O que uma pessoa vê agora: os avisos de sistema, os da sua empresa e os dos
 * projetos em que está. `now` vem do JavaScript e não do now() da base de
 * dados, que nos testes fica parado no início da transação.
 */
export async function getAnnouncementFeed(options: {
    companyId: string;
    projectIds: string[];
    now: Date;
}): Promise<Announcement[]> {
    const query = announcementRepo
        .createQueryBuilder("a")
        .where("a.startsAt <= :now", { now: options.now })
        .andWhere("(a.endsAt IS NULL OR a.endsAt > :now)")
        .andWhere(new Brackets((scope) => {
            scope
                .where("a.scope = :system", { system: AnnouncementScope.System })
                .orWhere("(a.scope = :company AND a.companyId = :companyId)", {
                    company: AnnouncementScope.Company,
                    companyId: options.companyId,
                });

            // Um IN () vazio não é SQL válido.
            if (options.projectIds.length > 0) {
                scope.orWhere("(a.scope = :project AND a.projectId IN (:...projectIds))", {
                    project: AnnouncementScope.Project,
                    projectIds: options.projectIds,
                });
            }
        }));

    for (const [column, direction] of ORDER) {
        query.addOrderBy(column, direction);
    }

    return await query.getMany();
}

export interface AnnouncementFilter {
    scopes?: AnnouncementScope[];
    companyId?: string;
    projectIds?: string[];
    /** Só os que estão ativos neste instante. Sem ele, também os agendados e os que já acabaram. */
    activeAt?: Date;
}

/** Para as listas de gestão e para a página do projeto. Uma lista vazia de scopes ou de projetos dá []. */
export async function getAnnouncements(filter: AnnouncementFilter): Promise<Announcement[]> {
    if (filter.scopes?.length === 0 || filter.projectIds?.length === 0) {
        return [];
    }

    const query = announcementRepo.createQueryBuilder("a");

    if (filter.scopes) {
        query.andWhere("a.scope IN (:...scopes)", { scopes: filter.scopes });
    }

    if (filter.companyId) {
        query.andWhere("a.companyId = :companyId", { companyId: filter.companyId });
    }

    if (filter.projectIds) {
        query.andWhere("a.projectId IN (:...projectIds)", { projectIds: filter.projectIds });
    }

    if (filter.activeAt) {
        query
            .andWhere("a.startsAt <= :now", { now: filter.activeAt })
            .andWhere("(a.endsAt IS NULL OR a.endsAt > :now)");
    }

    for (const [column, direction] of ORDER) {
        query.addOrderBy(column, direction);
    }

    return await query.getMany();
}

export async function createAnnouncement(announcement: Announcement) {
    return await announcementRepo.save(announcement);
}

export async function updateAnnouncement(announcement: Announcement) {
    return await announcementRepo.save(announcement);
}

/** Apagar leva as leituras atrás, pela FK em cascata. */
export async function deleteAnnouncement(id: string) {
    return await announcementRepo.delete({
        id
    });
}
