import { LessThan } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { ProjectMessage } from "../entities/ProjectMessage.js";
import { ProjectMessageRead } from "../entities/ProjectMessageRead.js";

export const projectMessageRepo = AppDataSource.getRepository(ProjectMessage);

export async function getProjectMessageById(id: string): Promise<ProjectMessage | null> {
    return await projectMessageRepo.findOneBy({
        id
    });
}

/**
 * Uma página do chat, da mais recente para trás. O id é uuidv7, que ordena
 * pelo tempo, por isso serve de cursor, como nas notificações.
 */
export async function getProjectMessagesPage(
    projectId: string,
    options: { before?: string | undefined; limit: number },
): Promise<ProjectMessage[]> {
    return await projectMessageRepo.find({
        where: {
            projectId,
            ...(options.before ? { id: LessThan(options.before) } : {}),
        },
        order: { id: "DESC" },
        take: options.limit,
    });
}

export async function getLatestProjectMessageId(projectId: string): Promise<string | null> {
    const latest = await projectMessageRepo.findOne({
        select: { id: true },
        where: { projectId },
        order: { id: "DESC" },
    });

    return latest?.id ?? null;
}

/**
 * Quantas mensagens de outros cada pessoa tem por ler, em cada projeto: as
 * que vêm depois da sua marca, ou todas se nunca leu. Só os que têm alguma.
 */
export async function countUnreadProjectMessages(userId: string, projectIds: string[]): Promise<Map<string, number>> {
    if (projectIds.length === 0) {
        return new Map();
    }

    const rows = await projectMessageRepo
        .createQueryBuilder("m")
        .leftJoin(ProjectMessageRead, "r", "r.projectId = m.projectId AND r.userId = :userId", { userId })
        .select("m.projectId", "projectId")
        .addSelect("COUNT(*)", "unread")
        .where("m.projectId IN (:...projectIds)", { projectIds })
        .andWhere("m.authorId <> :userId", { userId })
        .andWhere("(r.lastReadMessageId IS NULL OR m.id > r.lastReadMessageId)")
        .groupBy("m.projectId")
        .getRawMany<{ projectId: string; unread: string }>();

    // O COUNT do Postgres é um bigint, e chega como string.
    return new Map(rows.map((row) => [row.projectId, Number(row.unread)]));
}

export async function createProjectMessage(message: ProjectMessage) {
    return await projectMessageRepo.save(message);
}

export async function updateProjectMessage(message: ProjectMessage) {
    return await projectMessageRepo.save(message);
}

export async function deleteProjectMessage(id: string) {
    return await projectMessageRepo.delete({
        id
    });
}
